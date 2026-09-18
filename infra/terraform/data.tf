resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = [for subnet in aws_subnet.db : subnet.id]
}
resource "aws_db_instance" "main" {
  identifier                      = var.name
  engine                          = "mysql"
  engine_version                  = var.mysql_engine_version
  instance_class                  = var.db_instance_class
  allocated_storage               = 20
  max_allocated_storage           = 100
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "cloud_file_manager"
  username                        = "cfm_admin"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  availability_zone               = var.az_a
  multi_az                        = false
  publicly_accessible             = false
  backup_retention_period         = 7
  backup_window                   = "18:00-19:00"
  maintenance_window              = "sun:19:30-sun:20:30"
  auto_minor_version_upgrade      = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${var.name}-final"
  delete_automated_backups        = false
  copy_tags_to_snapshot           = true
  enabled_cloudwatch_logs_exports = ["error", "slowquery"]
  lifecycle { prevent_destroy = true }
  depends_on = [aws_cloudwatch_log_group.rds]
}
resource "aws_s3_bucket" "files" {
  bucket        = var.bucket_name
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "files" {
  bucket = aws_s3_bucket.files.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "files" {
  bucket = aws_s3_bucket.files.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyNonTLS", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.files.arn, "${aws_s3_bucket.files.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  cors_rule {
    allowed_origins = ["https://${var.domain}"]
    allowed_methods = ["POST", "GET", "HEAD"]
    allowed_headers = ["Content-Type"]
    expose_headers  = ["x-amz-version-id", "ETag"]
    max_age_seconds = 300
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "temporary" {
  bucket = aws_s3_bucket.files.id
  dynamic "rule" {
    for_each = toset(["incoming/", "processing-results/"])
    content {
      id     = replace(rule.value, "/", "-expiry")
      status = "Enabled"
      filter { prefix = rule.value }
      expiration { days = var.temporary_retention_days }
      noncurrent_version_expiration { noncurrent_days = var.temporary_retention_days }
      abort_incomplete_multipart_upload { days_after_initiation = 1 }
    }
  }
  depends_on = [aws_s3_bucket_versioning.files]
}

# SecureString values are provisioned separately. Terraform owns only their key.
resource "aws_kms_key" "parameters" {
  description             = "${var.name} runtime SecureString key"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  lifecycle { prevent_destroy = true }
}
resource "aws_kms_alias" "parameters" {
  name          = "alias/${var.name}-parameters"
  target_key_id = aws_kms_key.parameters.key_id
}
