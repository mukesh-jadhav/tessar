output "sql_instance_name" {
  value       = google_sql_database_instance.main.name
  description = "Cloud SQL instance name."
}

output "sql_instance_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "Cloud SQL connection name (project:region:instance) for the proxy + Cloud Run."
}

output "sql_private_ip" {
  value       = google_sql_database_instance.main.private_ip_address
  description = "Private IP of the Postgres instance."
}

output "database_name" {
  value       = google_sql_database.tessar.name
  description = "Application database name."
}

output "db_user" {
  value       = google_sql_user.app.name
  description = "Application DB user."
}

output "db_password_secret_id" {
  value       = google_secret_manager_secret.db_password.secret_id
  description = "Secret Manager id holding the app DB password."
}

output "redis_host" {
  value       = google_redis_instance.events.host
  description = "Memorystore Redis private IP."
}

output "redis_port" {
  value       = google_redis_instance.events.port
  description = "Memorystore Redis port."
}

output "redis_auth_secret_id" {
  value       = google_secret_manager_secret.redis_auth.secret_id
  description = "Secret Manager id holding the Redis AUTH string."
}

output "artifacts_bucket" {
  value       = google_storage_bucket.artifacts.name
  description = "GCS bucket for run artifacts (PDF/MD/JSON/SVG)."
}

output "briefs_bucket" {
  value       = google_storage_bucket.briefs.name
  description = "GCS bucket for raw briefs (private, audit-only)."
}
