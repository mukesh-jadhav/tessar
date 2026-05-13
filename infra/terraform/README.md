# infra/terraform

Terraform (Google provider) for TESSAR infrastructure. **No** Bicep, CDK, or
Pulumi. Per [`architecture.instructions.md`](../../.github/instructions/architecture.instructions.md).

## Status

- **`envs/dev`**: scaffolded — **passes `terraform fmt` + `terraform validate`
  with `-backend=false`** (enforced in CI by `.github/workflows/pr.yml` →
  `terraform` job). Cannot `terraform init` against the real GCS backend
  until the human prereqs in
  [`docs/operations/phase2-prereqs.md`](../../docs/operations/phase2-prereqs.md)
  are completed (GCP project + billing + region + state bucket + WIF + the
  pre-seeded secrets in §7). All resources here are written but **not yet
  applied**. See [ADR-0006](../../docs/adr/0006-phase1-feedback-gate-closed-offline.md)
  / [ADR-0007](../../docs/adr/0007-orm-choice-prisma-web-sqlalchemy-worker.md)
  for the gating decisions.
- **`envs/prod`**: empty placeholder. Brought up at Phase 4.

## Layout

```
infra/terraform/
├── .gitignore
├── envs/
│   ├── dev/
│   │   ├── backend.tf                  # gcs backend (values via -backend-config)
│   │   ├── backend.hcl.example         # bucket + prefix to pass to `terraform init`
│   │   ├── providers.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars.example    # copy → terraform.tfvars (gitignored) and fill
│   │   ├── main.tf                     # wires the four modules
│   │   └── outputs.tf
│   └── prod/                           # placeholder
└── modules/
    ├── network/   # VPC + subnet + Serverless VPC Connector + PSA + Cloud DNS zone (opt)
    ├── data/      # Cloud SQL Postgres 16 (private IP), Memorystore Redis (private),
    │              # GCS artifacts + briefs buckets, DB password & Redis-auth secrets
    ├── compute/   # Artifact Registry, runtime SAs, Cloud Run web + orchestrator,
    │              # Pub/Sub topic + DLQ + push subscription with OIDC
    └── edge/      # Cloud Armor (managed OWASP + rate limit), serverless NEG,
                   # backend service w/ Cloud CDN, managed cert, global LB, DNS A
```

## What this `dev` env will provision (when applied)

Per [MVP.md](../../MVP.md) §3, §4, §5.8:

1. VPC with one regional subnet, Serverless VPC Connector, Private Service
   Access peering (so Cloud SQL + Memorystore can sit on private IPs).
2. Cloud SQL Postgres 16, single-zone in dev, private IP only, IAM auth on,
   PITR + 14-day backups. `pgvector` is enabled per-database via the Prisma
   migration (ADR-0007), not via flag.
3. Memorystore Redis Basic 1 GB, private IP, AUTH on, transit encryption.
4. Two GCS buckets (`tessar-dev-artifacts`, `tessar-dev-briefs`) — uniform
   bucket-level access, public-access prevention, lifecycle to Nearline.
5. Two Artifact Registry Docker repos (one per service).
6. Per-service runtime service accounts with least-privilege IAM:
   - `tessar-web` → publishes to Pub/Sub topic, reads artifacts, R/W briefs,
     reads its secrets.
   - `tessar-orchestrator` → writes artifacts, reads briefs, reads its
     secrets, calls Vertex AI.
   - `tessar-pubsub-invoker` → only role: invoke the orchestrator service.
7. Cloud Run v2 services for `tessar-web` and `tessar-orchestrator`,
   `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`, VPC connector attached, image
   pinned to Google's hello placeholder until first CI deploy
   (`lifecycle.ignore_changes` on `image` so CI can roll forward).
8. Pub/Sub `tessar-runs` topic + `tessar-runs-dlq` DLQ + push subscription
   with OIDC token bound to the orchestrator's URL as audience (matches the
   security baseline in [MVP.md](../../MVP.md) §5.8).
9. Global External HTTPS LB → Serverless NEG → `tessar-web`, with Cloud CDN,
   Cloud Armor (managed OWASP rule + per-IP rate limit), Google-managed
   TLS cert, and an HTTP→HTTPS redirect.
10. Cloud DNS A record for `dev.tessar.dev` pointing at the LB IP (only if
    Terraform owns the zone — `create_dns_zone = true`).

## How to apply (after prereqs are done)

```powershell
cd infra/terraform/envs/dev
Copy-Item backend.hcl.example backend.hcl
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit both with your values from phase2-prereqs.md §9.

terraform init -backend-config=backend.hcl
terraform fmt -recursive ../..
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

## Conventions

- One env = one Terraform workspace and one state file. No cross-env state
  sharing.
- Secrets (DB password, Redis AUTH) are generated **inside** Terraform and
  written to Secret Manager. Pre-existing app secrets
  (`authjs-secret`, OAuth, Resend) are seeded by the human in
  [`phase2-prereqs.md`](../../docs/operations/phase2-prereqs.md) §7 and only
  granted IAM here.
- Cloud Run images use a Google-public placeholder; CI is the source of
  truth for what actually runs. Terraform ignores image drift.
- All public traffic goes through the LB. Cloud Run ingress is
  internal-and-load-balancer only — never `INGRESS_TRAFFIC_ALL`.
- `deletion_protection = true` by default for Cloud SQL and the buckets;
  flip per resource if you want to nuke dev.
