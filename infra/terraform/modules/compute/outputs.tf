output "web_service_name" {
  value       = google_cloud_run_v2_service.web.name
  description = "Cloud Run service name for tessar-web."
}

output "web_service_uri" {
  value       = google_cloud_run_v2_service.web.uri
  description = "Default Cloud Run URI for tessar-web (used as LB backend)."
}

output "web_service_account_email" {
  value       = google_service_account.web.email
  description = "Runtime SA for tessar-web."
}

output "orchestrator_service_name" {
  value       = google_cloud_run_v2_service.orchestrator.name
  description = "Cloud Run service name for tessar-orchestrator."
}

output "orchestrator_service_uri" {
  value       = google_cloud_run_v2_service.orchestrator.uri
  description = "Default Cloud Run URI for tessar-orchestrator."
}

output "orchestrator_service_account_email" {
  value       = google_service_account.orchestrator.email
  description = "Runtime SA for tessar-orchestrator."
}

output "pubsub_topic_runs" {
  value       = google_pubsub_topic.runs.name
  description = "Pub/Sub topic name for run jobs."
}

output "pubsub_topic_runs_dlq" {
  value       = google_pubsub_topic.runs_dlq.name
  description = "Pub/Sub DLQ topic name."
}

output "artifact_registry_web" {
  value       = google_artifact_registry_repository.web.name
  description = "Artifact Registry repo for tessar-web images."
}

output "artifact_registry_orchestrator" {
  value       = google_artifact_registry_repository.orchestrator.name
  description = "Artifact Registry repo for tessar-orchestrator images."
}
