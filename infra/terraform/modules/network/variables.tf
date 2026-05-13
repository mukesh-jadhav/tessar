variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region. Locked at the env level (see phase2-prereqs.md §1.3)."
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix, e.g. 'tessar-dev'."
  type        = string
}

variable "subnet_cidr" {
  description = "Primary subnet CIDR for the VPC."
  type        = string
  default     = "10.20.0.0/20"
}

variable "connector_cidr" {
  description = "/28 CIDR for the Serverless VPC Access connector. Must not overlap subnet_cidr."
  type        = string
  default     = "10.20.16.0/28"
}

variable "create_dns_zone" {
  description = "Create a Cloud DNS managed zone for dns_root (Option A)."
  type        = bool
  default     = true
}

variable "dns_root" {
  description = "DNS root, e.g. 'tessar.dev'."
  type        = string
}
