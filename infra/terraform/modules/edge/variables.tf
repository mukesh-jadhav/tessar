variable "project_id" {
  type        = string
  description = "GCP project id."
}

variable "region" {
  type        = string
  description = "GCP region (used for the serverless NEG)."
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix, e.g. 'tessar-dev'."
}

variable "web_service_name" {
  type        = string
  description = "Cloud Run service name to put behind the LB."
}

variable "fqdn" {
  type        = string
  description = "Public hostname, e.g. 'dev.tessar.dev'."
}

variable "dns_zone_name" {
  type        = string
  description = "Cloud DNS managed zone name. Pass null to skip A-record creation (Option B)."
  default     = null
}
