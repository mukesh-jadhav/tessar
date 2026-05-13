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
# VPC + subnet
# ---------------------------------------------------------------------------

resource "google_compute_network" "this" {
  name                    = "${var.name_prefix}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "primary" {
  name                     = "${var.name_prefix}-subnet"
  project                  = var.project_id
  network                  = google_compute_network.this.id
  region                   = var.region
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# ---------------------------------------------------------------------------
# Serverless VPC Access connector — lets Cloud Run reach private IPs
# (Cloud SQL + Memorystore Redis).
# ---------------------------------------------------------------------------

resource "google_vpc_access_connector" "this" {
  name          = "${var.name_prefix}-conn"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.this.name
  ip_cidr_range = var.connector_cidr
  min_instances = 2
  max_instances = 3
  machine_type  = "e2-micro"
}

# ---------------------------------------------------------------------------
# Private Service Access — required for Cloud SQL + Memorystore on private IP.
# ---------------------------------------------------------------------------

resource "google_compute_global_address" "psa_range" {
  name          = "${var.name_prefix}-psa-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.this.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}

# ---------------------------------------------------------------------------
# Cloud DNS managed zone (Option A in phase2-prereqs.md §2.2).
# ---------------------------------------------------------------------------

resource "google_dns_managed_zone" "root" {
  count       = var.create_dns_zone ? 1 : 0
  name        = "${var.name_prefix}-zone"
  project     = var.project_id
  dns_name    = "${var.dns_root}."
  description = "TESSAR root DNS zone (managed by Terraform)"
}
