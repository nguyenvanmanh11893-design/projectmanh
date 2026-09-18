variable "enable_cd" {
  type    = bool
  default = false
}
variable "github_deploy_subject" {
  description = "Exact verified GitHub OIDC sub for protected production environment; supports repositories using immutable IDs. No wildcard."
  type        = string
  default     = ""
  validation {
    condition     = var.github_deploy_subject == "" || (startswith(var.github_deploy_subject, "repo:") && endswith(var.github_deploy_subject, ":environment:production") && length(regexall("[?*]", var.github_deploy_subject)) == 0)
    error_message = "Use the exact production environment subject, without wildcards."
  }
}
resource "aws_s3_bucket" "releases" {
  count         = var.enable_cd ? 1 : 0
  bucket        = "${var.name}-${local.account}-releases"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "releases" {
  count                   = var.enable_cd ? 1 : 0
  bucket                  = aws_s3_bucket.releases[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "releases" {
  count  = var.enable_cd ? 1 : 0
  bucket = aws_s3_bucket.releases[0].id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  count  = var.enable_cd ? 1 : 0
  bucket = aws_s3_bucket.releases[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "releases" {
  count  = var.enable_cd ? 1 : 0
  bucket = aws_s3_bucket.releases[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.releases[0].arn, "${aws_s3_bucket.releases[0].arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_ssm_document" "release" {
  count         = var.enable_cd ? 1 : 0
  name          = "${var.name}-release"
  document_type = "Command"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Only reviewed root-owned release controller; no arbitrary shell input"
    parameters = {
      Action   = { type = "String", allowedValues = ["stage", "migrate", "deploy", "rollback"], interpolationType = "ENV_VAR" }
      Sha      = { type = "String", allowedPattern = "^[a-f0-9]{40}$", interpolationType = "ENV_VAR" }
      Checksum = { type = "String", allowedPattern = "^[a-f0-9]{64}$", interpolationType = "ENV_VAR" }
    }
    mainSteps = [{ action = "aws:runShellScript", name = "release", inputs = {
      timeoutSeconds = "900"
      runCommand     = ["/usr/bin/python3.12 /opt/cloud-files/release.py \"$SSM_Action\" \"$SSM_Sha\" \"$SSM_Checksum\""]
    } }]
  })
}
resource "aws_iam_role" "deploy" {
  count = var.enable_cd ? 1 : 0
  name  = "${var.name}-application-deploy"
  lifecycle {
    precondition {
      condition     = var.github_deploy_subject != ""
      error_message = "Verify and configure the exact production OIDC subject before enabling CD."
    }
  }
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Federated = var.github_oidc_provider_arn }, Action = "sts:AssumeRoleWithWebIdentity",
    Condition = { StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = var.github_deploy_subject } }
  }] })
}
resource "aws_iam_role_policy" "deploy" {
  count = var.enable_cd ? 1 : 0
  role  = aws_iam_role.deploy[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject"], Resource = "${aws_s3_bucket.releases[0].arn}/releases/*" },
    { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = [aws_ssm_document.release[0].arn, aws_instance.app.arn] },
    # GetCommandInvocation has no resource-level authorization.
    { Effect = "Allow", Action = ["ssm:GetCommandInvocation"], Resource = "*" }
  ] })
}
resource "aws_iam_role_policy" "release_reader" {
  count = var.enable_cd ? 1 : 0
  role  = aws_iam_role.app.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.releases[0].arn}/releases/*" },
    { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = "arn:${local.partition}:ssm:${local.region}:${local.account}:parameter/${var.name}/migration" },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = aws_kms_key.parameters.arn, Condition = { StringEquals = {
      "kms:ViaService" = "ssm.${local.region}.amazonaws.com", "kms:EncryptionContext:PARAMETER_ARN" = "arn:${local.partition}:ssm:${local.region}:${local.account}:parameter/${var.name}/migration"
    } } }
  ] })
}
output "cd_configuration" {
  value = var.enable_cd ? { role = aws_iam_role.deploy[0].arn, bucket = aws_s3_bucket.releases[0].id, instance = aws_instance.app.id, document = aws_ssm_document.release[0].name } : null
}
