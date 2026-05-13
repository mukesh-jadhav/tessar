# Cost watch — `tessar-dev`

Phase-2 infra is live in `asia-south1`. Funding via personal billing account (no Google for Startups credits — not eligible without registered org).

## Estimated idle baseline (no traffic, 24/7)

| Resource                                     | Spec                                       | ~$/mo                            |
| -------------------------------------------- | ------------------------------------------ | -------------------------------- |
| Cloud SQL `tessar-dev-pg`                    | `db-custom-1-3840`, 20 GB SSD, PITR, ZONAL | ~$55                             |
| Memorystore Redis `tessar-dev-redis`         | BASIC, 1 GB, REDIS_7_2                     | ~$35                             |
| Global LB + 2 forwarding rules + reserved IP |                                            | ~$25                             |
| Cloud Armor policy `tessar-dev-armor`        | 1 policy, 2 rules                          | ~$6                              |
| Serverless VPC Connector `tessar-dev-conn`   | min-2 e2-micro, 24/7                       | ~$10                             |
| Cloud DNS zone `tessar-dev-zone`             | 1 zone                                     | ~$0.20                           |
| Secret Manager                               | ~6 active secrets                          | ~$0.40                           |
| Logging / Monitoring                         | low ingest                                 | ~$2–5                            |
| Cloud Run (web + orchestrator)               | min-instances=0                            | $0 idle                          |
| Pub/Sub, GCS, Artifact Registry              | empty / per-msg                            | ~$0 idle                         |
| **Total idle baseline**                      |                                            | **~$130–140 / mo (~$4–5 / day)** |

> Source: list pricing for `asia-south1`, May 2026. Real bill may be 10–20% lower with sustained-use discounts.

## Decision plan (review after 3–4 days of real billing data)

After ~96 h of live infra, check actual spend in Console → Billing → Reports, scoped to project `tessar-dev`. Compare against baseline above. Then decide:

- [ ] **Spend ≤ baseline and tolerable** → keep as-is, focus on Phase 3.
- [ ] **Spend uncomfortable** → apply downsizes:
  - [ ] Drop Cloud SQL to `db-f1-micro` (~$10/mo) — saves ~$45/mo. Sufficient for KB seed (~150 records) + dev runs.
  - [ ] Pause SQL on idle days: `gcloud sql instances patch tessar-dev-pg --activation-policy=NEVER --project=tessar-dev` (revert with `ALWAYS`). Saves ~$1.50/day.
  - [ ] Defer Memorystore until actually needed by orchestrator (delete + recreate via TF; safe — Redis state is ephemeral cache).
  - [ ] Consider re-region to `us-central1` (typically 15–25% cheaper than `asia-south1`). Heavy lift — only do if billing pain warrants it; would require recreating LB cert, DNS already points to global IP so safe to swap.

## Hard guardrails (do these regardless)

- [ ] **Set a budget alert** in Console → Billing → Budgets & alerts. Suggested: $50/mo with email at 50%/90%/100%. **Do this immediately.**
- [ ] **Check GCP Free Trial credits** ($300 / 90 days) — if `tessar-dev`'s billing account is fresh, this likely already applied. Console → Billing → Credits. If active, idle baseline is fully covered for ~2 months.
- [ ] **Watch Cloud Run egress** in Phase 3+ — outbound LLM calls go via VPC connector → NAT → public internet. NAT data-processing fee adds up if calls are chatty. Cache aggressively in Redis (already planned).

## Not on the table

- Google for Startups Cloud Program — requires incorporated startup with website + founders + funding (we don't qualify yet).
- Tearing down nightly via Terraform — too brittle (cert reprovisioning, DNS, state drift).
