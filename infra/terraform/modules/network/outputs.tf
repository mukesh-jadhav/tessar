output "network_id" {
  description = "Self-link of the VPC."
  value       = google_compute_network.this.id
}

output "network_name" {
  description = "Name of the VPC."
  value       = google_compute_network.this.name
}

output "subnet_id" {
  description = "Self-link of the primary subnet."
  value       = google_compute_subnetwork.primary.id
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector id (consumed by Cloud Run)."
  value       = google_vpc_access_connector.this.id
}

output "psa_connection" {
  description = "Service-networking peering connection (depended on by Cloud SQL + Memorystore)."
  value       = google_service_networking_connection.psa.id
}

output "psa_range_name" {
  description = "Name of the PSA-reserved global address range (consumed by Memorystore reserved_ip_range)."
  value       = google_compute_global_address.psa_range.name
}

output "dns_zone_name" {
  description = "Cloud DNS managed zone name (null if not created)."
  value       = try(google_dns_managed_zone.root[0].name, null)
}

output "dns_name_servers" {
  description = "Nameservers to delegate to at the registrar (null if zone not created)."
  value       = try(google_dns_managed_zone.root[0].name_servers, null)
}
