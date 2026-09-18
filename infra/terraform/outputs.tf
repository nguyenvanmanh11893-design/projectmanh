output "public_ip" { value = aws_eip.app.public_ip }
output "instance_id" { value = aws_instance.app.id }
output "db_host" { value = aws_db_instance.main.address }
output "bucket" { value = aws_s3_bucket.files.id }
output "parameter_name" { value = "/${var.name}/runtime" }
output "parameter_key_arn" { value = aws_kms_key.parameters.arn }
output "ci_role_arn" { value = aws_iam_role.ci.arn }
output "master_secret_arn" {
  description = "Reference only; Terraform never reads the secret value. Operator bootstrap only."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}
