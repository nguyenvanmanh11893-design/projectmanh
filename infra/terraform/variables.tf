variable "name" {
  type    = string
  default = "cloud-files-prod"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name))
    error_message = "Use 3-31 lowercase letters, digits or hyphens, starting with a letter."
  }
}
variable "bucket_name" { type = string }
variable "domain" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}$", var.domain))
    error_message = "Supply a DNS hostname without scheme, port, wildcard or path."
  }
}
variable "az_a" {
  type    = string
  default = "ap-southeast-1a"
}
variable "az_b" {
  type    = string
  default = "ap-southeast-1b"
}
variable "ami_id" {
  description = "Reviewed x86_64 Amazon Linux 2023 AMI in Singapore; includes SSM Agent."
  type        = string
}
variable "instance_type" {
  type    = string
  default = "t3.small"
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "mysql_engine_version" {
  description = "Explicit MySQL 8.4 version available in Singapore, reviewed before plan."
  type        = string
}
variable "lambda_zip" {
  description = "Locally built immutable ZIP containing index.js, validator.js, ESM package.json and pinned dependencies."
  type        = string
}
variable "alert_email" { type = string }
variable "monthly_budget_usd" {
  type    = number
  default = 75
  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "Budget must be positive."
  }
}
variable "temporary_retention_days" {
  type    = number
  default = 30
  validation {
    condition     = var.temporary_retention_days >= 30 && floor(var.temporary_retention_days) == var.temporary_retention_days
    error_message = "Keep incoming versions and reports at least 30 days for recovery."
  }
}
variable "github_oidc_provider_arn" {
  description = "Existing account GitHub OIDC provider, bootstrapped by an administrator."
  type        = string
}
variable "github_repository" {
  description = "Exact owner/repository permitted to publish the Lambda artifact."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use an exact owner/repo; wildcards are forbidden."
  }
}
