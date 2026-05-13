variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "region" {
  type        = string
  description = "GCP region."
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix, e.g. 'tessar-dev'."
}

variable "network_id" {
  type        = string
  description = "VPC self-link from the network module."
}

variable "psa_connection" {
  type        = string
  description = "Service-networking peering connection id (forces correct dependency order)."
}

variable "psa_range_name" {
  type        = string
  description = "Name of the PSA-reserved global address range. Memorystore Redis allocates a /29 from this range; with PSA + 'auto' GCP sometimes tries to make a new reservation and fails with 'address space exhausted'."
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier. db-custom-1-3840 is enough for dev."
  default     = "db-custom-1-3840"
}

variable "db_ha" {
  type        = bool
  description = "Regional HA. Off in dev to save cost; on in prod."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Block accidental destroy of the SQL instance + buckets."
  default     = true
}

variable "kms_key_name" {
  type        = string
  description = "Optional CMEK for the artifacts bucket. Empty = Google-managed."
  default     = ""
}
