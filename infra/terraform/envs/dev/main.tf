module "network" {
  source = "../../modules/network"

  project_id      = var.project_id
  region          = var.region
  name_prefix     = var.name_prefix
  dns_root        = var.dns_root
  create_dns_zone = var.create_dns_zone
}

module "data" {
  source = "../../modules/data"

  project_id          = var.project_id
  region              = var.region
  name_prefix         = var.name_prefix
  network_id          = module.network.network_id
  psa_connection      = module.network.psa_connection
  psa_range_name      = module.network.psa_range_name
  deletion_protection = var.deletion_protection
}

module "compute" {
  source = "../../modules/compute"

  project_id            = var.project_id
  region                = var.region
  env                   = var.env
  vpc_connector_id      = module.network.vpc_connector_id
  sql_private_ip        = module.data.sql_private_ip
  redis_host            = module.data.redis_host
  redis_port            = module.data.redis_port
  artifacts_bucket      = module.data.artifacts_bucket
  briefs_bucket         = module.data.briefs_bucket
  db_password_secret_id = module.data.db_password_secret_id
  redis_auth_secret_id  = module.data.redis_auth_secret_id
  web_min_instances     = var.web_min_instances
}

module "edge" {
  source = "../../modules/edge"

  project_id       = var.project_id
  region           = var.region
  name_prefix      = var.name_prefix
  web_service_name = module.compute.web_service_name
  fqdn             = var.fqdn
  dns_zone_name    = module.network.dns_zone_name
}
