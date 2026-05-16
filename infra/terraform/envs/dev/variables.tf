variable "project_id" {
  type        = string
  description = "GCP project id, e.g. 'tessar-dev'."
}

variable "project_number" {
  type        = string
  description = "GCP project number (string). Needed for some IAM members."
}

variable "region" {
  type        = string
  description = "Locked region. Pick once: asia-south1 | us-central1 | europe-west1."
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix."
  default     = "tessar-dev"
}

variable "env" {
  type        = string
  description = "Environment label."
  default     = "dev"
}

variable "dns_root" {
  type        = string
  description = "DNS root, e.g. 'tessar.dev'."
  default     = "tessar.dev"
}

variable "fqdn" {
  type        = string
  description = "Public hostname for this env."
  default     = "dev.tessar.dev"
}

variable "create_dns_zone" {
  type        = bool
  description = "Create the Cloud DNS zone (Option A in phase2-prereqs.md). Set false if you already created it manually."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Block accidental destroy of stateful resources."
  default     = true
}

variable "web_min_instances" {
  type        = number
  description = "Min instances for tessar-web."
  default     = 0
}

variable "auth_allowed_emails" {
  type        = string
  description = "Comma-separated pre-launch sign-in allowlist (see apps/web/auth.config.ts). Empty = bootstrap admin only. '*' disables the gate entirely (open sign-in)."
  default     = ""
}
