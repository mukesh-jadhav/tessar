variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "region" {
  type        = string
  description = "GCP region."
}

variable "env" {
  type        = string
  description = "Environment label, e.g. 'dev' or 'prod'."
}

variable "vertex_location" {
  type        = string
  description = "Vertex AI location for Gemini calls. Must host the configured models (gemini-2.5-pro is available in us-central1, europe-west1/4, asia-southeast1, and the global endpoint — NOT asia-south1)."
  default     = "us-central1"
}

variable "vpc_connector_id" {
  type        = string
  description = "Serverless VPC Access connector id (from network module)."
}

variable "sql_private_ip" {
  type        = string
  description = "Cloud SQL Postgres private IP (from data module)."
}

variable "redis_host" {
  type        = string
  description = "Memorystore Redis private IP (from data module)."
}

variable "redis_port" {
  type        = number
  description = "Memorystore Redis port (from data module)."
}

variable "artifacts_bucket" {
  type        = string
  description = "GCS bucket for run artifacts (from data module)."
}

variable "briefs_bucket" {
  type        = string
  description = "GCS bucket for raw briefs (from data module)."
}

variable "db_password_secret_id" {
  type        = string
  description = "Secret Manager id of the app DB password (from data module)."
}

variable "redis_auth_secret_id" {
  type        = string
  description = "Secret Manager id of the Redis AUTH string (from data module)."
}

variable "web_min_instances" {
  type        = number
  description = "Min instances for tessar-web. 1 in prod, 0 in dev to save cost."
  default     = 0
}

# ---------------------------------------------------------------------------
# Auth.js + magic-link wiring for tessar-web.
#
# Secret values themselves live in Secret Manager and are mounted via
# `secret_key_ref` (see compute/main.tf). These variables only carry the
# non-sensitive scaffolding (public URL, allowlist, SMTP transport coords).
# ---------------------------------------------------------------------------

variable "auth_url" {
  type        = string
  description = "Public origin Auth.js uses to build callback URLs, e.g. 'https://dev.tessar.dev'. Must match the OAuth client's authorised redirect URI ({auth_url}/api/auth/callback/google)."
}

variable "auth_allowed_emails" {
  type        = string
  description = "Comma-separated pre-launch sign-in allowlist (see apps/web/auth.config.ts). Empty = bootstrap admin only. Use '*' to disable the gate entirely once you're ready for open sign-in."
  default     = ""
}

variable "smtp_host" {
  type        = string
  description = "SMTP server for magic-link delivery. Defaults to Resend's SMTP gateway."
  default     = "smtp.resend.com"
}

variable "smtp_port" {
  type        = number
  description = "SMTP port. 465 for Resend (implicit TLS)."
  default     = 465
}

variable "smtp_user" {
  type        = string
  description = "SMTP username. Resend uses the literal string 'resend' (the API key is the password)."
  default     = "resend"
}

variable "auth_email_from" {
  type        = string
  description = "From header for magic-link emails. Must be a verified Resend sender (or domain)."
  default     = "TESSAR <[email protected]>"
}

variable "database_name" {
  type        = string
  description = "Application database name on the Cloud SQL instance (from data module)."
}

variable "db_user" {
  type        = string
  description = "Application DB user (from data module)."
}

variable "database_url_secret_id" {
  type        = string
  description = "Secret Manager secret id holding the full DATABASE_URL connection string (postgresql://user:pass@host:5432/db). Created and populated out-of-band — Terraform only grants read access and mounts it."
  default     = "tessar-database-url"
}
