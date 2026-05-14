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
