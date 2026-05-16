terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30, < 6.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Artifact Registry — one Docker repo per service, regional.
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "web" {
  repository_id = "tessar-web"
  project       = var.project_id
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for tessar-web (Next.js)."
}

resource "google_artifact_registry_repository" "orchestrator" {
  repository_id = "tessar-orchestrator"
  project       = var.project_id
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for tessar-orchestrator (Python LangGraph)."
}

# ---------------------------------------------------------------------------
# Per-service runtime service accounts (least privilege).
# ---------------------------------------------------------------------------

resource "google_service_account" "web" {
  account_id   = "tessar-web"
  project      = var.project_id
  display_name = "Runtime SA for tessar-web Cloud Run service"
}

resource "google_service_account" "orchestrator" {
  account_id   = "tessar-orchestrator"
  project      = var.project_id
  display_name = "Runtime SA for tessar-orchestrator Cloud Run service"
}

resource "google_service_account" "pubsub_invoker" {
  account_id   = "tessar-pubsub-invoker"
  project      = var.project_id
  display_name = "Pub/Sub push subscription identity → invokes orchestrator"
}

# Web SA: read app secrets + use Cloud SQL.
# Sentry DSN secrets (`sentry-dsn-web`, `sentry-dsn-worker`) are provisioned
# manually via gcloud (see docs/adr/0010). They are added here so the runtime
# SAs can read them once they exist; if a referenced secret is absent, apply
# will fail until it is created.
locals {
  web_secret_ids = [
    var.db_password_secret_id,
    var.redis_auth_secret_id,
    "authjs-secret",
    "google-oauth-client-id",
    "google-oauth-client-secret",
    "resend-api-key",
    "sentry-dsn-web",
  ]

  orchestrator_secret_ids = [
    var.db_password_secret_id,
    var.redis_auth_secret_id,
    "sentry-dsn-worker",
  ]
}

resource "google_secret_manager_secret_iam_member" "web_secret_access" {
  for_each  = toset(local.web_secret_ids)
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

resource "google_secret_manager_secret_iam_member" "orchestrator_secret_access" {
  for_each  = toset(local.orchestrator_secret_ids)
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.orchestrator.email}"
}

resource "google_project_iam_member" "web_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.web.email}"
}

resource "google_project_iam_member" "orchestrator_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.orchestrator.email}"
}

# Orchestrator: write artifacts to GCS; web: read artifacts to sign URLs.
resource "google_storage_bucket_iam_member" "orchestrator_artifacts_writer" {
  bucket = var.artifacts_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.orchestrator.email}"
}

resource "google_storage_bucket_iam_member" "web_artifacts_reader" {
  bucket = var.artifacts_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.web.email}"
}

resource "google_storage_bucket_iam_member" "web_briefs_admin" {
  bucket = var.briefs_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web.email}"
}

resource "google_storage_bucket_iam_member" "orchestrator_briefs_reader" {
  bucket = var.briefs_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.orchestrator.email}"
}

# Orchestrator runs Vertex AI calls.
resource "google_project_iam_member" "orchestrator_vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.orchestrator.email}"
}

# Phase 4.2 — Cloud Trace export. Both runtimes ship OTEL spans to Cloud
# Trace via the GCP exporter, which authenticates with ADC. Requires
# `cloudtrace.googleapis.com` to be enabled on the project (assumed
# pre-enabled along with the other core APIs).
resource "google_project_iam_member" "web_cloudtrace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.web.email}"
}

resource "google_project_iam_member" "orchestrator_cloudtrace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.orchestrator.email}"
}

# ---------------------------------------------------------------------------
# Pub/Sub: tessar-runs topic + DLQ + push subscription target.
# Push subscription is created here pointing at the orchestrator's URL once
# the service exists — see the depends_on chain.
# ---------------------------------------------------------------------------

resource "google_pubsub_topic" "runs" {
  name    = "tessar-runs"
  project = var.project_id

  message_retention_duration = "604800s" # 7 days

  labels = {
    env     = var.env
    service = "tessar-orchestrator"
  }
}

resource "google_pubsub_topic" "runs_dlq" {
  name                       = "tessar-runs-dlq"
  project                    = var.project_id
  message_retention_duration = "604800s"
}

# Allow Pub/Sub to publish to the DLQ on our behalf.
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_pubsub_topic_iam_member" "pubsub_dlq_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.runs_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Web service publishes to the topic.
resource "google_pubsub_topic_iam_member" "web_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.runs.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.web.email}"
}

# Web service is allowed to act as the topic identity (for OIDC tokens).
resource "google_project_iam_member" "web_token_creator" {
  project = var.project_id
  role    = "roles/iam.serviceAccountTokenCreator"
  member  = "serviceAccount:${google_service_account.web.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run services. Image is a placeholder until first CI deploy; the
# `lifecycle.ignore_changes` on `image` means CI can roll forward without
# fighting Terraform.
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "web" {
  name     = "tessar-web"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.web.email
    timeout         = "60s"

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = 10
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 3000
      }

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "TESSAR_ENV"
        value = var.env
      }
      env {
        name  = "TESSAR_REGION"
        value = var.region
      }
      env {
        name  = "DATABASE_HOST"
        value = var.sql_private_ip
      }
      env {
        name  = "REDIS_HOST"
        value = var.redis_host
      }
      env {
        name  = "REDIS_PORT"
        value = tostring(var.redis_port)
      }
      env {
        name  = "GCS_BUCKET"
        value = var.artifacts_bucket
      }
      env {
        name  = "BRIEFS_BUCKET"
        value = var.briefs_bucket
      }
      env {
        name  = "PUBSUB_TOPIC_RUNS"
        value = google_pubsub_topic.runs.name
      }
    }
  }

  lifecycle {
    # The full env block (AUTH_*, SMTP_*, DATABASE_URL, REDIS_URL,
    # BILLING_ENABLED, Sentry, etc.) is managed out-of-band by CI
    # (`gcloud run deploy --update-env-vars` in .github/workflows/main.yml)
    # and by one-off `gcloud run services update` calls. Listing every
    # var here would constantly drift against those external updates,
    # so Terraform owns the eight bootstrap env vars above (which it
    # creates fresh on first apply) and then defers to runtime tooling
    # for everything else. If you ever flip this back to TF-managed,
    # remove `template[0].containers[0].env` from ignore_changes AND
    # add every env var the live service currently has — otherwise
    # apply will strip them.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[0].env,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_service" "orchestrator" {
  name     = "tessar-orchestrator"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account                  = google_service_account.orchestrator.email
    timeout                          = "3600s" # 60 min — long enough for the agent graph
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        cpu_idle = false
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "TESSAR_ENV"
        value = var.env
      }
      env {
        name  = "TESSAR_REGION"
        value = var.region
      }
      env {
        name  = "DATABASE_HOST"
        value = var.sql_private_ip
      }
      env {
        name  = "REDIS_HOST"
        value = var.redis_host
      }
      env {
        name  = "REDIS_PORT"
        value = tostring(var.redis_port)
      }
      env {
        name  = "GCS_BUCKET"
        value = var.artifacts_bucket
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_PROJECT"
        value = var.project_id
      }
      env {
        name  = "VERTEX_LOCATION"
        value = var.vertex_location
      }
      # Note: PUBSUB_AUDIENCE is set out-of-band by the CI deploy step,
      # because it must equal this service's own URI (self-reference would
      # create a Terraform cycle).
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# Pub/Sub push subscription → orchestrator. OIDC-verified.
resource "google_cloud_run_v2_service_iam_member" "orchestrator_invoker" {
  name     = google_cloud_run_v2_service.orchestrator.name
  project  = var.project_id
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

# Web service is reachable only via the Global LB (ingress=INTERNAL_LOAD_BALANCER),
# but the LB itself invokes Cloud Run anonymously — so the service still needs an
# unauthenticated invoker binding for end users to reach the app.
# Auth.js handles user authentication at the application layer.
resource "google_cloud_run_v2_service_iam_member" "web_public_invoker" {
  name     = google_cloud_run_v2_service.web.name
  project  = var.project_id
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_pubsub_subscription" "runs_to_orchestrator" {
  name    = "tessar-runs-to-orchestrator"
  project = var.project_id
  topic   = google_pubsub_topic.runs.name

  ack_deadline_seconds       = 600
  message_retention_duration = "604800s"
  enable_message_ordering    = false

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.runs_dlq.id
    max_delivery_attempts = 5
  }

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.orchestrator.uri}/pubsub/push"
    oidc_token {
      service_account_email = google_service_account.pubsub_invoker.email
      audience              = google_cloud_run_v2_service.orchestrator.uri
    }
  }

  depends_on = [google_cloud_run_v2_service_iam_member.orchestrator_invoker]
}
