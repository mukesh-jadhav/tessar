terraform {
  required_version = ">= 1.7.0"

  # Backend values are filled at `terraform init -backend-config=...` time
  # (see backend.hcl.example) so the same code can be re-pointed for prod.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30, < 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 5.30, < 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }
}
