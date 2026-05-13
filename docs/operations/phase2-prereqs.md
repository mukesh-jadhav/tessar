# Phase 2 — Prerequisites Runbook

> Audience: you (the founder), doing this once, by hand, before I scaffold any
> backend code. Every step ends with a concrete artifact you'll paste back to
> me (or store in a password manager). Estimated total: **3–5 focused hours**,
> spread over 1–2 days because of email/DNS propagation and Google approval
> waits.
>
> Source of truth for *why* each step matters:
> [`architecture.instructions.md`](../../.github/instructions/architecture.instructions.md),
> [`MVP.md`](../../MVP.md) §3, [`IMPLEMENTATION.md`](../../IMPLEMENTATION.md) §5.

---

## 0. Before you start — collect these

Open a temporary scratch doc (1Password / Bitwarden secure note recommended).
You'll fill these in as you go. Anything marked 🔒 must end up only in a
password manager or Secret Manager — never in git.

```
GCP_ORG_ID                  =
GCP_BILLING_ACCOUNT_ID      =
GCP_PROJECT_ID_DEV          =
GCP_PROJECT_ID_PROD         =          # create now, leave empty
GCP_REGION                  =          # asia-south1 OR us-central1
GCP_PROJECT_NUMBER_DEV      =          # auto-assigned by GCP
TF_STATE_BUCKET             =          # tessar-tf-state-<projectid>
DOMAIN_ROOT                 = tessar.dev
DOMAIN_DEV                  = dev.tessar.dev
DNS_PROVIDER                =          # Cloudflare / Namecheap / etc
GITHUB_ORG                  =
GITHUB_REPO                 = tessar
WIF_POOL_ID                 = github-pool
WIF_PROVIDER_ID             = github-provider
RESEND_API_KEY              = 🔒
RESEND_SENDING_DOMAIN       = noreply.tessar.dev
GOOGLE_OAUTH_CLIENT_ID      =
GOOGLE_OAUTH_CLIENT_SECRET  = 🔒
AUTHJS_SECRET               = 🔒        # 32-byte base64 random
SENTRY_DSN_WEB              =          # optional, can defer
SENTRY_DSN_WORKER           =          # optional, can defer
POSTHOG_PROJECT_API_KEY     =          # optional, can defer
```

Done? Good. Now go in order.

---

## 1. GCP — projects, billing, region (≈ 30 min)

### 1.1 Create the org / billing account (skip if already done)

If you don't yet have a GCP organization, create one via Google Workspace
(`tessar.dev` workspace) or use a personal account project — both work for
MVP. **Recommended:** create a Workspace-backed org so prod is properly
governed; not a blocker for `dev`.

1. Go to <https://console.cloud.google.com/billing>.
2. Create a billing account, attach a card.
3. Note `GCP_BILLING_ACCOUNT_ID` (looks like `01ABCD-234567-89EFGH`).

### 1.2 Apply to Google for Startups Cloud Program

Submit **before** you provision anything heavy — gives you up to **$200k in
credits** depending on stage.

- URL: <https://cloud.google.com/startup>
- Use the "Start tier" (no investor required) if you're solo / pre-seed.
- Approval typically: **24–72 hours**.
- While waiting, proceed with the rest of this doc; everything below is
  free or pennies.

### 1.3 Lock the region

Pick **one** and write it into `GCP_REGION`:

| Region | Pick if… |
|---|---|
| `asia-south1` (Mumbai) | You're in India, early users mostly in India/SEA, latency to user matters |
| `us-central1` (Iowa) | You want broadest Vertex AI model availability + cheapest egress |
| `europe-west1` (Belgium) | EU customers / GDPR optics matter |

This is **locked** once chosen — Cloud SQL, Memorystore, Cloud Run all live
here. Migrating regions later = a multi-day project.

### 1.4 Create the `dev` project

```powershell
# Install gcloud first if you haven't:
#   https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud projects create tessar-dev --name="TESSAR dev"
gcloud beta billing projects link tessar-dev `
  --billing-account=$env:GCP_BILLING_ACCOUNT_ID
gcloud config set project tessar-dev
gcloud projects describe tessar-dev --format="value(projectNumber)"
# ↑ paste this into GCP_PROJECT_NUMBER_DEV
```

Repeat for `tessar-prod` (don't enable extra services yet — placeholder).

### 1.5 Enable required APIs (one shot)

```powershell
gcloud services enable `
  run.googleapis.com `
  sqladmin.googleapis.com `
  redis.googleapis.com `
  pubsub.googleapis.com `
  storage.googleapis.com `
  secretmanager.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  iam.googleapis.com `
  iamcredentials.googleapis.com `
  servicenetworking.googleapis.com `
  vpcaccess.googleapis.com `
  aiplatform.googleapis.com `
  certificatemanager.googleapis.com `
  compute.googleapis.com `
  dns.googleapis.com `
  monitoring.googleapis.com `
  logging.googleapis.com `
  cloudtrace.googleapis.com `
  --project=tessar-dev
```

This will take ~2 min. Some APIs (`servicenetworking`, `aiplatform`) take
longer to fully provision; that's fine, Terraform will retry.

### 1.6 Create the Terraform state bucket

```powershell
$BUCKET = "tessar-tf-state-tessar-dev"
gcloud storage buckets create "gs://$BUCKET" `
  --project=tessar-dev `
  --location=$env:GCP_REGION `
  --uniform-bucket-level-access `
  --public-access-prevention
gcloud storage buckets update "gs://$BUCKET" --versioning
```

Paste the bucket name into `TF_STATE_BUCKET`.

✅ **Deliverable to me:** `GCP_PROJECT_ID_DEV`, `GCP_PROJECT_NUMBER_DEV`,
`GCP_REGION`, `TF_STATE_BUCKET`, billing-linked confirmation.

---

## 2. Domain & DNS (≈ 20 min + propagation wait)

### 2.1 Confirm `tessar.dev` is registered

If not, register it now (`.dev` requires HTTPS — that's fine, we're using a
managed cert anyway). Cloudflare or Namecheap both work.

### 2.2 Decide who owns DNS

**Option A (recommended): Cloud DNS**
- Pros: Terraform-managed, integrates with managed certs.
- Cons: You delegate the whole zone to Google.

```powershell
gcloud dns managed-zones create tessar-dev-zone `
  --dns-name="tessar.dev." `
  --description="TESSAR root zone" `
  --project=tessar-dev
gcloud dns managed-zones describe tessar-dev-zone `
  --project=tessar-dev `
  --format="value(nameServers)"
```

Take those 4 NS records, go to your registrar, replace the default
nameservers with these. Wait 1–24 hours for propagation.

**Option B: keep Cloudflare/Namecheap DNS**
- I'll generate the records, you paste them in. Slower iteration, fine for
  MVP. Tell me which you picked.

### 2.3 Sub-records needed (FYI — Terraform will create most)

```
dev.tessar.dev          A     <load-balancer-ip>     (created in Phase 2)
noreply.tessar.dev      MX    <Resend MX>            (Step 3)
noreply.tessar.dev      TXT   v=spf1 include:...     (Step 3)
resend._domainkey...    TXT   <DKIM>                 (Step 3)
```

✅ **Deliverable to me:** confirmation that `tessar.dev` is registered and
which DNS option you chose. Paste the nameservers if Option A.

---

## 3. Resend — magic-link emails (≈ 20 min + DNS propagation)

Auth.js sends magic-link emails via Resend. Without this, you can't sign in.

1. Sign up: <https://resend.com>.
2. **Add domain** → enter `noreply.tessar.dev` (subdomain, not root —
   keeps your root domain free for marketing email later).
3. Resend shows you 3 DNS records (MX, SPF TXT, DKIM TXT). Add them in
   Cloud DNS / your registrar.
4. Wait for verification (usually < 10 min after DNS propagates).
5. **Create an API key** → "Sending access" scope only → name it
   `tessar-dev`. Copy the `re_…` value. **You will not see it again.**

🔒 Paste into `RESEND_API_KEY`. We'll move it to Secret Manager in Step 7.

✅ **Deliverable:** Resend domain status = "Verified".

---

## 4. Google OAuth client (≈ 10 min)

1. <https://console.cloud.google.com/apis/credentials> → project `tessar-dev`.
2. **Configure OAuth consent screen** (do this first if first time):
   - User type: **External**.
   - App name: `TESSAR (dev)`.
   - User support email: your email.
   - Developer contact: your email.
   - Scopes: `openid`, `email`, `profile` (defaults).
   - Test users: add your own email + 2–3 collaborators.
3. **Create credentials → OAuth Client ID**:
   - Application type: **Web application**.
   - Name: `tessar-web-dev`.
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://dev.tessar.dev`
   - **Authorized redirect URIs:**
     - `http://localhost:3000/api/auth/callback/google`
     - `https://dev.tessar.dev/api/auth/callback/google`
4. Download the JSON or copy the Client ID + Client Secret.

Paste into `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` 🔒.

> Consent screen stays in "Testing" mode until launch — that's fine. Only
> listed test users can sign in. We'll publish at Phase 6.

✅ **Deliverable:** Client ID + Secret pair.

---

## 5. Auth.js secret (≈ 1 min)

```powershell
# Generates a 32-byte random base64 string suitable for AUTH_SECRET.
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

🔒 Paste the output into `AUTHJS_SECRET`.

---

## 6. GitHub — Workload Identity Federation (≈ 15 min)

This lets GitHub Actions deploy to GCP **without** any long-lived service-
account key. Industry-standard secure pattern.

### 6.1 Create the WIF pool + provider

```powershell
$PROJECT_ID     = "tessar-dev"
$PROJECT_NUMBER = "<paste GCP_PROJECT_NUMBER_DEV>"
$GH_ORG         = "<paste GITHUB_ORG>"
$GH_REPO        = "tessar"

gcloud iam workload-identity-pools create github-pool `
  --project=$PROJECT_ID `
  --location=global `
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider `
  --project=$PROJECT_ID `
  --location=global `
  --workload-identity-pool=github-pool `
  --display-name="GitHub provider" `
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" `
  --attribute-condition="assertion.repository_owner == '$GH_ORG'" `
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 6.2 Service account that GH Actions will impersonate

```powershell
gcloud iam service-accounts create tessar-ci-dev `
  --project=$PROJECT_ID `
  --display-name="TESSAR CI deployer (dev)"

# Allow your GH repo to impersonate it.
gcloud iam service-accounts add-iam-policy-binding `
  "tessar-ci-dev@$PROJECT_ID.iam.gserviceaccount.com" `
  --project=$PROJECT_ID `
  --role="roles/iam.workloadIdentityUser" `
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$GH_ORG/$GH_REPO"

# Grant minimum deploy roles for Phase 2 (we'll tighten in Phase 4).
foreach ($role in @(
  "roles/run.admin",
  "roles/storage.admin",
  "roles/artifactregistry.writer",
  "roles/iam.serviceAccountUser",
  "roles/cloudsql.client",
  "roles/secretmanager.secretAccessor",
  "roles/pubsub.editor"
)) {
  gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:tessar-ci-dev@$PROJECT_ID.iam.gserviceaccount.com" `
    --role=$role
}
```

### 6.3 Capture the binding strings for me

```powershell
"projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
"tessar-ci-dev@$PROJECT_ID.iam.gserviceaccount.com"
```

✅ **Deliverable to me:** both strings above + your GitHub org name.

---

## 7. Secret Manager — store everything sensitive (≈ 10 min)

We never put secrets in `.env` files in the repo. Cloud Run pulls them at
runtime from Secret Manager via the service account.

```powershell
$PROJECT_ID = "tessar-dev"

# Helper: create a secret from a value at the prompt.
function New-TessarSecret($name, $value) {
  gcloud secrets create $name --project=$PROJECT_ID --replication-policy=automatic 2>$null
  $value | gcloud secrets versions add $name --project=$PROJECT_ID --data-file=-
}

New-TessarSecret "authjs-secret"            "<AUTHJS_SECRET>"
New-TessarSecret "google-oauth-client-id"   "<GOOGLE_OAUTH_CLIENT_ID>"
New-TessarSecret "google-oauth-client-secret" "<GOOGLE_OAUTH_CLIENT_SECRET>"
New-TessarSecret "resend-api-key"           "<RESEND_API_KEY>"
# DB password + Redis auth come later — Terraform creates them.
```

✅ **Deliverable:** none (just confirm "done"). I'll wire the names into
Terraform.

---

## 8. Optional but recommended (defer if tight on time)

### 8.1 Sentry

- Sign up: <https://sentry.io>. Org name `tessar`.
- Create 2 projects: `tessar-web` (Next.js) and `tessar-orchestrator` (Python).
- Copy each DSN. Paste into `SENTRY_DSN_WEB`, `SENTRY_DSN_WORKER`.
- I'll add to Secret Manager and wire SDKs in Phase 2.

### 8.2 PostHog

- Sign up: <https://posthog.com>. EU region recommended for GDPR optics.
- Create project `tessar`. Copy the project API key.
- Paste into `POSTHOG_PROJECT_API_KEY`.

Skip these for now if you want — they slot in at Phase 4 cleanly.

### 8.3 Stripe (test mode)

Phase 2 has **no Stripe**. Don't create a Stripe account yet — saves you
configuring webhooks twice. We do this fresh in Phase 4.

---

## 9. Hand-back checklist

Paste this back to me, filled in, and I'll start scaffolding Terraform.

```
GCP_PROJECT_ID_DEV          = ____
GCP_PROJECT_NUMBER_DEV      = ____
GCP_REGION                  = ____
TF_STATE_BUCKET             = ____
DOMAIN_DEV                  = dev.tessar.dev   ✓ confirmed
DNS_OPTION                  = A (Cloud DNS) | B (external)
RESEND_DOMAIN_VERIFIED      = yes / no
GOOGLE_OAUTH_CLIENT_ID      = ____
WIF_PROVIDER_RESOURCE       = projects/____/locations/global/workloadIdentityPools/github-pool/providers/github-provider
WIF_DEPLOYER_SA             = tessar-ci-dev@____.iam.gserviceaccount.com
GITHUB_ORG                  = ____
SECRETS_CREATED             = authjs-secret, google-oauth-client-id, google-oauth-client-secret, resend-api-key   ✓
GFS_CLOUD_PROGRAM           = applied / approved / not yet
SENTRY_WIRED                = yes / defer
POSTHOG_WIRED               = yes / defer
```

You do **not** need to share secret values with me — only the non-secret
identifiers above. Secrets stay in Secret Manager and your password
manager.

---

## 10. What I'll do once you hand this back

1. Scaffold `infra/terraform/` with `dev` workspace pointed at your state
   bucket and project.
2. Provision: VPC + Serverless VPC Connector, Cloud SQL Postgres 16 +
   pgvector, Memorystore Redis (Basic 1GB), Pub/Sub topic + DLQ + push
   subscription scaffold, Cloud Storage buckets, Artifact Registry repos,
   Cloud Run service skeletons (web + orchestrator) wired to Secret
   Manager.
3. Wire Auth.js (Google + Resend magic-link), Drizzle migrations, and the
   real SSE pipeline (web → Pub/Sub → orchestrator → Redis Stream → SSE).
4. Replace Phase-1 mocks with real persistence, but the orchestrator still
   returns one of the **canned** Phase-1 fixture packages — exactly what
   [`IMPLEMENTATION.md`](../../IMPLEMENTATION.md) §5.2 asks for.
5. Run a restore-from-backup drill on Cloud SQL `dev`.

That's the Phase 2 DoD met.
