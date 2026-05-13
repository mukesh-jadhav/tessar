output "lb_ip" {
  value       = google_compute_global_address.web.address
  description = "Reserved global anycast IP for the HTTPS LB. Point your DNS A record here if not using Cloud DNS."
}

output "managed_cert_name" {
  value       = google_compute_managed_ssl_certificate.web.name
  description = "Managed certificate name (status visible via gcloud)."
}

output "armor_policy_name" {
  value       = google_compute_security_policy.web.name
  description = "Cloud Armor policy attached to the web backend service."
}
