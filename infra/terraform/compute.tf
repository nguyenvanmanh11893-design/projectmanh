resource "aws_instance" "app" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.app.name
  disable_api_termination     = true
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = false
  }
  # No user_data: audited AMI + explicit Session Manager bootstrap runbook.
  lifecycle { prevent_destroy = true }
}
resource "aws_eip" "app" {
  domain     = "vpc"
  instance   = aws_instance.app.id
  depends_on = [aws_internet_gateway.main]
}
resource "aws_sqs_queue" "validator_failures" {
  name                      = "${var.name}-validator-failures"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  lifecycle { prevent_destroy = true }
}
resource "aws_sqs_queue_policy" "tls" {
  queue_url = aws_sqs_queue.validator_failures.url
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "sqs:*", Resource = aws_sqs_queue.validator_failures.arn
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_lambda_function" "validator" {
  function_name                  = "${var.name}-validator"
  role                           = aws_iam_role.validator.arn
  runtime                        = "nodejs22.x"
  handler                        = "index.handler"
  filename                       = var.lambda_zip
  source_code_hash               = filebase64sha256(var.lambda_zip)
  memory_size                    = 512
  timeout                        = 60
  reserved_concurrent_executions = 5
  # Intentionally no vpc_config: validator only accesses S3, SQS and Logs.
  depends_on = [aws_iam_role_policy.validator, aws_cloudwatch_log_group.lambda]
}
resource "aws_lambda_function_event_invoke_config" "validator" {
  function_name                = aws_lambda_function.validator.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 21600
  destination_config {
    on_failure { destination = aws_sqs_queue.validator_failures.arn }
  }
}
resource "aws_lambda_permission" "s3" {
  statement_id   = "AllowIncomingFromOwnedBucket"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.validator.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.files.arn
  source_account = local.account
}
resource "aws_s3_bucket_notification" "incoming" {
  bucket = aws_s3_bucket.files.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.validator.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "incoming/"
  }
  depends_on = [aws_lambda_permission.s3, aws_lambda_function_event_invoke_config.validator, aws_s3_bucket_versioning.files]
}
