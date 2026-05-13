output "lb_ip" {
  value       = module.edge.lb_ip
  description = "Anycast IP for dev.tessar.dev. If create_dns_zone = false, set the A record at your registrar to this."
}

output "web_service_uri" {
  value       = module.compute.web_service_uri
  description = "Default Cloud Run URI for tessar-web (also the LB backend)."
}

output "orchestrator_service_uri" {
  value       = module.compute.orchestrator_service_uri
  description = "Default Cloud Run URI for tessar-orchestrator. Pub/Sub push target."
}

output "sql_connection_name" {
  value       = module.data.sql_instance_connection_name
  description = "Cloud SQL connection name (project:region:instance) for the proxy."
}

output "artifacts_bucket" {
  value       = module.data.artifacts_bucket
  description = "GCS bucket for run artifacts."
}

output "pubsub_topic_runs" {
  value       = module.compute.pubsub_topic_runs
  description = "Pub/Sub topic for run jobs."
}

output "dns_name_servers" {
  value       = module.network.dns_name_servers
  description = "Cloud DNS nameservers (only set if create_dns_zone = true)."
}
