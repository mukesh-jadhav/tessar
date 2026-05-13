# Cloud SQL — Restore-from-Backup Drill

> **Purpose.** Prove the Phase-2 DoD item: we can restore the `dev` Cloud SQL
> Postgres instance from an automated backup, with no data loss beyond the
> last backup window, in under 60 minutes.
>
> **When to run.** First time: as soon as `terraform apply` for `envs/dev`
> finishes and the instance has at least one automated backup (typically
> 24 hours after creation). Then: quarterly, and after any change to the
> Cloud SQL module.
>
> **Source of truth for what's being tested.**
> [`infra/terraform/modules/data/main.tf`](../../infra/terraform/modules/data/main.tf)
> — Postgres 16, PITR on, 14-day automated backups, ENTERPRISE edition.

---

## 0. Before you start

Open one PowerShell window with these set (values from
[`phase2-prereqs.md`](./phase2-prereqs.md) §9):

```powershell
$PROJECT_ID   = "tessar-dev"
$REGION       = "<your locked region>"          # asia-south1 / us-central1 / europe-west1
$INSTANCE     = "tessar-dev-pg"                 # name is "$name_prefix-pg" from data module
$DRILL_TAG    = (Get-Date -Format "yyyyMMdd-HHmm")
$CLONE_NAME   = "tessar-dev-pg-restore-$DRILL_TAG"
$DRILL_DB     = "tessar"                        # logical database to verify
gcloud config set project $PROJECT_ID
```

**Confirm prerequisites:**

```powershell
# 1. Instance exists and is RUNNABLE.
gcloud sql instances describe $INSTANCE --format="value(state)"
# expect: RUNNABLE

# 2. At least one automated backup exists.
gcloud sql backups list --instance=$INSTANCE --limit=5 `
  --format="table(id,startTime,status,type)"
# expect: at least one row with type=AUTOMATED, status=SUCCESSFUL.

# 3. PITR is on (binary log retention).
gcloud sql instances describe $INSTANCE `
  --format="value(settings.backupConfiguration.pointInTimeRecoveryEnabled)"
# expect: True
```

If any of these are not true, **stop**. Fix the instance config first
(usually means waiting for the first automated backup to land — runs once
per day in the configured backup window).

---

## 1. Seed canary data

We need something in the live DB whose presence/absence proves the
restore worked.

```powershell
# Connect via the Cloud SQL Auth Proxy in another window:
#   cloud-sql-proxy "$PROJECT_ID:$REGION:$INSTANCE"
# Then in psql (or any postgres client) against localhost:5432:

psql -h 127.0.0.1 -U tessar-app -d $DRILL_DB
```

```sql
CREATE TABLE IF NOT EXISTS restore_drill (
  id           bigserial PRIMARY KEY,
  drill_tag    text        NOT NULL,
  inserted_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO restore_drill (drill_tag) VALUES (:'tag') RETURNING id, inserted_at;
-- record the returned timestamp; you'll need it as the PITR target.
\q
```

Note the `inserted_at` value — call it `T_INSERT`. Wait at least
**5 minutes** so it's safely past the next WAL flush, then capture
`T_AFTER = T_INSERT + 5min` as a clean PITR target.

---

## 2. Pick the restore method

We test **clone-to-new-instance**, not in-place restore. In-place would
overwrite live data — never acceptable as a drill.

| Method                                  | When to use                                    | Tested here?    |
| --------------------------------------- | ---------------------------------------------- | --------------- |
| Clone from latest automated backup      | Day-to-day "oops, dropped a table 8h ago"      | ✅ Step 3       |
| Clone via PITR to specific timestamp    | "Bad migration ran at 14:32, restore to 14:31" | ✅ Step 4       |
| In-place restore over the live instance | True disaster, live data is gone               | ❌ Not in drill |

We exercise both clone modes because they're the only two we'd ever run
in a real incident.

---

## 3. Restore A — clone from latest backup

```powershell
$BACKUP_ID = (gcloud sql backups list --instance=$INSTANCE `
  --filter="type=AUTOMATED AND status=SUCCESSFUL" `
  --sort-by="~startTime" --limit=1 --format="value(id)")
"latest backup id: $BACKUP_ID"

gcloud sql backups restore $BACKUP_ID `
  --restore-instance=$CLONE_NAME `
  --backup-instance=$INSTANCE `
  --async
# returns an operation id; the clone takes 5–25 min depending on DB size.
```

Poll until done:

```powershell
gcloud sql operations list --instance=$CLONE_NAME `
  --format="table(name,operationType,status,startTime,endTime)" --limit=5
# wait for status=DONE.
```

**Verify:**

```powershell
# Start a second proxy on a different port.
cloud-sql-proxy --port 5433 "$PROJECT_ID:$REGION:$CLONE_NAME"

psql -h 127.0.0.1 -p 5433 -U tessar-app -d $DRILL_DB -c `
  "SELECT id, drill_tag, inserted_at FROM restore_drill ORDER BY id DESC LIMIT 5;"
```

✅ Pass criteria: the row you inserted in §1 is present **only if** the
backup ran after `T_INSERT`. If not (most likely: backup is older than
your insert), this is expected — the row should be missing, and that
proves you're looking at the backup contents and not the live DB.

---

## 4. Restore B — Point-in-Time Recovery to `T_AFTER`

This is the one that should always show your canary row.

```powershell
$CLONE_PITR = "tessar-dev-pg-pitr-$DRILL_TAG"
# T_AFTER is from §1 — UTC, RFC 3339 with millisecond precision.
$T_AFTER    = "2026-05-13T10:42:00.000Z"   # ← REPLACE

gcloud sql instances clone $INSTANCE $CLONE_PITR `
  --point-in-time=$T_AFTER `
  --async
```

Poll the same way as §3, then connect on yet another port:

```powershell
cloud-sql-proxy --port 5434 "$PROJECT_ID:$REGION:$CLONE_PITR"

psql -h 127.0.0.1 -p 5434 -U tessar-app -d $DRILL_DB -c `
  "SELECT id, drill_tag, inserted_at FROM restore_drill WHERE drill_tag = '$DRILL_TAG';"
```

✅ Pass criteria: **exactly one row** with your `$DRILL_TAG`. If the row
is missing, PITR is broken — escalate before going live.

---

## 5. Measure & record

Fill in [`docs/operations/restore-drill-log.md`](./restore-drill-log.md)
(create if missing — see template at the bottom of this file):

| Metric                                                         | Target   | Actual |
| -------------------------------------------------------------- | -------- | ------ |
| Time from `gcloud sql backups restore` issued → clone RUNNABLE | < 30 min |        |
| Time from PITR clone issued → RUNNABLE                         | < 30 min |        |
| Canary row present in PITR clone                               | yes      |        |
| End-to-end drill duration (§1 → §6)                            | < 60 min |        |

**RPO budget:** 24 h (automated backup cadence) + WAL lag (typically < 1 min).
**RTO budget:** 60 min from detection to verified restored instance.

If either target is missed → file an issue tagged `phase-2-dod`,
investigate before declaring the drill passed.

---

## 6. Tear down clones

**Do this every time.** Clones cost the same as the source instance.

```powershell
gcloud sql instances delete $CLONE_NAME --quiet
gcloud sql instances delete $CLONE_PITR --quiet

# Drop the canary table from the live DB so it doesn't sit around forever.
# (Optional — leave it in if you want a permanent drill log table.)
# psql -h 127.0.0.1 -U tessar-app -d $DRILL_DB -c "DROP TABLE restore_drill;"
```

Verify nothing was left behind:

```powershell
gcloud sql instances list --filter="name~^tessar-dev-pg-(restore|pitr)-" `
  --format="table(name,state,createTime)"
# expect: empty
```

---

## 7. Common failure modes

| Symptom                                  | Cause                                                                                    | Fix                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Error 400: Invalid request: backup ID`  | Picked a `MANUAL` backup id by accident                                                  | Re-run §3 query, filter on `type=AUTOMATED`                                    |
| Clone stuck in `PENDING_CREATE` > 30 min | First clone of a large DB, or PSA peering not ready                                      | Wait 60 min total before escalating; check `gcloud sql operations describe`    |
| `psql: SSL connection required`          | Trying to connect without the Cloud SQL Auth Proxy                                       | Use the proxy; never expose a public IP                                        |
| Canary row missing in PITR clone         | `$T_AFTER` was earlier than `T_INSERT`, or PITR window expired (> 7 days for our config) | Re-pick `$T_AFTER` correctly; verify `pointInTimeRecoveryEnabled = True`       |
| `Permission denied on instance`          | Your gcloud principal lacks `roles/cloudsql.admin`                                       | Have project owner grant it; CI's `tessar-ci-dev` SA should not run this drill |

---

## 8. Drill log template

Append to `docs/operations/restore-drill-log.md`:

```markdown
## Drill — YYYY-MM-DD

- Operator:
- Region:
- Source instance:
- Source instance size at drill time (GB):
- Latest backup id used:
- T_INSERT:
- T_AFTER:
- Clone-from-backup duration:
- PITR-clone duration:
- Canary verified: yes / no
- Total drill duration:
- Issues encountered:
- Action items:
```
