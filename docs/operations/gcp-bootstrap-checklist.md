# GCP Bootstrap Checklist (Pre-Phase-2)

**Audience:** founder, executing manually before Terraform takes over.
**Region (locked 2026-05-11):** `asia-south1` (Mumbai). Single-region MVP.
**Domain (locked 2026-05-11):** `tessar.dev`.
**Account state (as of 2026-05-11):** personal GCP account, no projects yet.

This is the manual sequence to run **once** to get the org + projects + IAM
to the point where Terraform (Phase 2 first deliverable) can take over.
Do not run Terraform until everything in §1–§4 is checked.

---

## §1 — Google Cloud account + organization

- [ ] Create or sign in to a Google account dedicated to TESSAR ops
      (avoid personal Gmail; use `ops@tessar.dev` once email is wired).
- [ ] Enable Google Cloud free trial for the $300 starter credit (will be
      replaced by Google for Startups credits if approved — see separate
      checklist).
- [ ] **Decide on org type:**
      - [ ] **No Google Workspace** → operate without an organization
            resource. Simpler today; ports cleanly to a Workspace org
            later. _Choose this if you don't have a Workspace yet._
      - [ ] **Google Workspace on `tessar.dev`** → creates an organization
            resource automatically. Recommended once you're past Phase 6.
- [ ] Create a **billing account** with a real card. Note the billing
      account ID (format `01XXXX-XXXXXX-XXXXXX`).
- [ ] Set a **billing alert** at $50, $100, $250 (the entire MVP infra
      should sit under $250/mo at zero traffic; spikes are bugs).
- [ ] Set a **hard budget cap** at $500/mo (Phase 2 only, raise later).

---

## §2 — Three GCP projects

Create three projects up front so dev/staging/prod are separated from day
one. Naming convention: `tessar-<env>` with project IDs that include a
random suffix (Google requires global uniqueness).

- [ ] `tessar-dev` — your sandbox. Manual `gcloud` from your laptop OK.
- [ ] `tessar-staging` — CI deploys here on every `main` push.
- [ ] `tessar-prod` — CI deploys here only on tagged release.

For each project:
- [ ] Link to the billing account from §1.
- [ ] Set labels: `env=dev|staging|prod`, `app=tessar`, `owner=<your-handle>`.
- [ ] Enable the following APIs (one command per project):
      ```
      gcloud services enable \
        run.googleapis.com \
        cloudbuild.googleapis.com \
        artifactregistry.googleapis.com \
        sqladmin.googleapis.com \
        redis.googleapis.com \
        pubsub.googleapis.com \
        storage.googleapis.com \
        secretmanager.googleapis.com \
        iam.googleapis.com \
        iamcredentials.googleapis.com \
        sts.googleapis.com \
        cloudtrace.googleapis.com \
        monitoring.googleapis.com \
        logging.googleapis.com \
        compute.googleapis.com \
        certificatemanager.googleapis.com \
        servicenetworking.googleapis.com \
        aiplatform.googleapis.com
      ```

---

## §3 — Service accounts (least privilege)

Create per-service service accounts. **Do not** grant `editor` or `owner`.

In each project:

- [ ] `sa-tessar-web@<project>.iam.gserviceaccount.com`
      Roles: `run.invoker`, `secretmanager.secretAccessor`,
      `cloudsql.client`, `redis.viewer`, `pubsub.publisher`,
      `storage.objectAdmin` (scoped to the artifacts bucket via condition).
- [ ] `sa-tessar-orchestrator@<project>.iam.gserviceaccount.com`
      Roles: `secretmanager.secretAccessor`, `cloudsql.client`,
      `redis.editor`, `pubsub.subscriber`, `storage.objectAdmin`,
      `aiplatform.user` (Vertex AI), `logging.logWriter`,
      `cloudtrace.agent`.
- [ ] `sa-github-deployer@<project>.iam.gserviceaccount.com`
      Roles: `run.developer`, `artifactregistry.writer`,
      `iam.serviceAccountUser` (to act-as the two app SAs).

---

## §4 — Workload Identity Federation (GitHub → GCP)

This is what lets GitHub Actions deploy to Cloud Run without long-lived
JSON keys. Required before any CI deploy.

- [ ] In each project, create a **workload identity pool**
      `gh-actions-pool` and a **provider** `github` bound to GitHub OIDC.
- [ ] Bind `sa-github-deployer` to the provider with an attribute condition
      restricting to your repo:
      ```
      attribute.repository == "<github-username>/tessar"
      ```
- [ ] Capture the provider resource name — looks like
      `projects/<num>/locations/global/workloadIdentityPools/gh-actions-pool/providers/github`
      — and store it as a GitHub Actions repo secret
      `GCP_WORKLOAD_IDENTITY_PROVIDER` (per env).
- [ ] Store `sa-github-deployer` email as `GCP_DEPLOY_SA` (per env).
- [ ] Verify with a smoke action: `google-github-actions/auth@v2` →
      `gcloud auth list` should show the SA without a key file.

---

## §5 — Domain + DNS

- [ ] Confirm `tessar.dev` is registered to an account you control.
- [ ] In `tessar-prod`, create a Cloud DNS managed zone for `tessar.dev`.
- [ ] Update the registrar's nameservers to the four NS records Cloud DNS
      issued. _(Allow up to 24 h to propagate.)_
- [ ] Reserve subdomains:
      - `tessar.dev` — landing + product (Cloud Run via global LB)
      - `app.tessar.dev` — same Cloud Run service, kept as a switch lever
      - `status.tessar.dev` — public status page (Phase 6, pre-launch)
- [ ] Create a Google-managed cert for `tessar.dev` + `www.tessar.dev`
      (Phase 2's LB Terraform will reference it).

---

## §6 — Repo + CI prereqs

- [ ] Create the GitHub repo as **personal** (locked 2026-05-11). Move to
      an org later via a one-click transfer if/when you incorporate.
- [ ] Add repo secrets per env:
      `GCP_PROJECT_ID_DEV`, `GCP_PROJECT_ID_STAGING`, `GCP_PROJECT_ID_PROD`,
      and the `_PROVIDER` / `_DEPLOY_SA` pairs from §4.
- [ ] Add a `CODEOWNERS` file requiring your review on
      `infra/`, `packages/shared-schemas/`, `docs/adr/`.
- [ ] Enable branch protection on `main`:
      require PR, require CI green, require linear history.

---

## §7 — Cost & Quota guardrails

- [ ] Vertex AI: confirm your region (`asia-south1`) supports Gemini
      `1.5-pro` / `1.5-flash`. _(If not at time of Phase 2, pivot to
      `us-central1` for the worker only — see ADR sequel.)_
- [ ] Request quota increases proactively (default Cloud Run regional
      concurrency is plenty for MVP; default Vertex AI QPM may not be).
- [ ] Confirm Cloud SQL `db-f1-micro` is available in `asia-south1`
      (it is). Reserve `db-custom-1-3840` as the next-tier plan.

---

## §8 — Stripe (Phase-4 dependency, but start now)

Stripe verification for an Indian entity (assuming founder is India-based,
matching `asia-south1`) takes a week or two. Start the application before
Phase 2 ends.

- [ ] Create a Stripe account at <https://dashboard.stripe.com/register>.
- [ ] Submit business verification (PAN + address proof + bank account).
- [ ] Stay in test mode until Phase 6.
- [ ] Note: international card processing requires PCC clearance once you
      pass certain thresholds — see Stripe India docs.

---

## §9 — Sign-off

- [ ] Everything in §1–§7 is green.
- [ ] Stripe application from §8 is _submitted_ (not necessarily approved).
- [ ] Cleared to start Phase 2: write the first Terraform module in
      `infra/`.
