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
# Cloud Armor — start with managed OWASP rules + a generous rate limit.
# Tightened in Phase 4 per security baseline.
# ---------------------------------------------------------------------------

resource "google_compute_security_policy" "web" {
  name    = "${var.name_prefix}-armor"
  project = var.project_id
  type    = "CLOUD_ARMOR"

  # Phase 2: rate limit + default allow only.
  # Phase 4 ("Monetize & harden"): add preconfigured WAF rule sets via
  # `evaluatePreconfiguredWaf('owasp-crs-v030301-stable')` and tune sensitivity.
  # The legacy 'owasp-crs-v030001-stable' set has been retired by GCP.

  rule {
    action      = "rate_based_ban"
    priority    = 2000
    description = "Per-IP rate limit. Tighten in Phase 4."
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 600
        interval_sec = 60
      }
      ban_duration_sec = 600
    }
  }

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default rule, higher priority numbers = lower precedence."
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Serverless NEG → Cloud Run web service.
# ---------------------------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "${var.name_prefix}-web-neg"
  project               = var.project_id
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.web_service_name
  }
}

resource "google_compute_backend_service" "web" {
  name                  = "${var.name_prefix}-web-be"
  project               = var.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  enable_cdn            = true
  security_policy       = google_compute_security_policy.web.id

  cdn_policy {
    cache_mode                   = "CACHE_ALL_STATIC"
    default_ttl                  = 3600
    max_ttl                      = 86400
    client_ttl                   = 3600
    negative_caching             = true
    serve_while_stale            = 86400
    signed_url_cache_max_age_sec = 0
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }
}

# ---------------------------------------------------------------------------
# URL map + target HTTPS proxy + global forwarding rule.
# ---------------------------------------------------------------------------

resource "google_compute_url_map" "web" {
  name            = "${var.name_prefix}-urlmap"
  project         = var.project_id
  default_service = google_compute_backend_service.web.id
}

resource "google_compute_managed_ssl_certificate" "web" {
  name    = "${var.name_prefix}-cert"
  project = var.project_id

  managed {
    domains = [var.fqdn]
  }
}

resource "google_compute_target_https_proxy" "web" {
  name             = "${var.name_prefix}-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.web.id
  ssl_certificates = [google_compute_managed_ssl_certificate.web.id]
}

resource "google_compute_global_address" "web" {
  name    = "${var.name_prefix}-lb-ip"
  project = var.project_id
}

resource "google_compute_global_forwarding_rule" "web" {
  name                  = "${var.name_prefix}-https-fr"
  project               = var.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.web.address
  port_range            = "443"
  target                = google_compute_target_https_proxy.web.id
}

# HTTP → HTTPS redirect.
resource "google_compute_url_map" "redirect" {
  name    = "${var.name_prefix}-redirect"
  project = var.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${var.name_prefix}-http-proxy"
  project = var.project_id
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "redirect" {
  name                  = "${var.name_prefix}-http-fr"
  project               = var.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.web.address
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
}

# ---------------------------------------------------------------------------
# Cloud DNS A record → LB IP.
# ---------------------------------------------------------------------------

resource "google_dns_record_set" "web" {
  count        = var.dns_zone_name == null ? 0 : 1
  name         = "${var.fqdn}."
  project      = var.project_id
  managed_zone = var.dns_zone_name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.web.address]
}
