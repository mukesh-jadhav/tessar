terraform {
  required_version = ">= 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30, < 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }
}

# ---------------------------------------------------------------------------
# Cloud SQL Postgres 16 (private IP). pgvector is enabled per-database via
# `CREATE EXTENSION` in the Prisma migration (see ADR-0007), not via flag.
# ---------------------------------------------------------------------------

resource "random_password" "db_app" {
  length      = 32
  special     = true
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
  min_special = 1
}

resource "google_sql_database_instance" "main" {
  name                = "${var.name_prefix}-pg"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection

  depends_on = [var.psa_connection]

  settings {
    tier              = var.db_tier
    availability_type = var.db_ha ? "REGIONAL" : "ZONAL"
    disk_size         = 20
    disk_autoresize   = true
    edition           = "ENTERPRISE"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      enable_private_path_for_google_cloud_services = true
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = false
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

resource "google_sql_database" "tessar" {
  name     = "tessar"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "tessar_app"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.db_app.result
}

# ---------------------------------------------------------------------------
# Memorystore Redis (Basic 1GB, private IP). Used for SSE event Streams
# and prompt/retrieval cache.
# ---------------------------------------------------------------------------

resource "google_redis_instance" "events" {
  name                    = "${var.name_prefix}-redis"
  project                 = var.project_id
  region                  = var.region
  tier                    = "BASIC"
  memory_size_gb          = 1
  redis_version           = "REDIS_7_2"
  authorized_network      = var.network_id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  reserved_ip_range       = var.psa_range_name

  depends_on = [var.psa_connection]
}

# ---------------------------------------------------------------------------
# Cloud Storage: artifacts + briefs.
# Lifecycle to Nearline after 30d (per architecture.instructions.md).
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "artifacts" {
  name                        = "${var.name_prefix}-artifacts"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !var.deletion_protection

  versioning { enabled = true }

  lifecycle_rule {
    condition { age = 30 }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  dynamic "encryption" {
    for_each = var.kms_key_name == "" ? [] : [var.kms_key_name]
    content {
      default_kms_key_name = encryption.value
    }
  }
}

resource "google_storage_bucket" "briefs" {
  name                        = "${var.name_prefix}-briefs"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !var.deletion_protection

  versioning { enabled = true }

  lifecycle_rule {
    condition { age = 90 }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
}

# ---------------------------------------------------------------------------
# Secrets created by Terraform (DB password + Redis auth string).
# Pre-existing secrets from phase2-prereqs.md §7 are referenced as data
# sources at the env layer, NOT recreated here.
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "db_password" {
  secret_id = "tessar-db-password"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_app.result
}

resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "tessar-redis-auth"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis_auth" {
  secret      = google_secret_manager_secret.redis_auth.id
  secret_data = google_redis_instance.events.auth_string
}
