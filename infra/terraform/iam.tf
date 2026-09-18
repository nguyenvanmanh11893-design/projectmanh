resource "aws_iam_role" "app" {
  name = "${var.name}-ec2"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_instance_profile" "app" {
  name = var.name
  role = aws_iam_role.app.name
}
resource "aws_iam_role_policy" "app" {
  name = "runtime"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${aws_s3_bucket.files.arn}/incoming/*", "${aws_s3_bucket.files.arn}/objects/*"] },
      { Effect = "Allow", Action = ["s3:GetObjectVersion"], Resource = ["${aws_s3_bucket.files.arn}/incoming/*", "${aws_s3_bucket.files.arn}/objects/*"] },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${aws_s3_bucket.files.arn}/processing-results/*"] },
      { Effect = "Allow", Action = ["s3:DeleteObjectVersion"], Resource = ["${aws_s3_bucket.files.arn}/objects/*"] },
      { Effect = "Allow", Action = ["s3:ListBucketVersions"], Resource = [aws_s3_bucket.files.arn], Condition = { StringLike = { "s3:prefix" = ["objects/*"] } } },
      { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = [local.parameter_arn] },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.parameters.arn], Condition = { StringEquals = {
        "kms:ViaService" = "ssm.${local.region}.amazonaws.com", "kms:EncryptionContext:PARAMETER_ARN" = local.parameter_arn
      } } },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], Resource = [for group in aws_cloudwatch_log_group.app : "${group.arn}:*"] },
      # CloudWatch/SSM agent group discovery has no resource-level authorization.
      { Effect = "Allow", Action = ["logs:DescribeLogGroups"], Resource = "*" },
      # These agent APIs do not support per-resource ARNs. No SendCommand or session-start authority.
      { Effect = "Allow", Action = ["ssm:UpdateInstanceInformation", "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"], Resource = "*" }
    ]
  })
}
resource "aws_iam_role" "validator" {
  name = "${var.name}-validator"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}
resource "aws_iam_role_policy" "validator" {
  name = "validate-incoming"
  role = aws_iam_role.validator.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetObjectVersion"], Resource = ["${aws_s3_bucket.files.arn}/incoming/*"] },
    { Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${aws_s3_bucket.files.arn}/processing-results/*"] },
    { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = [aws_sqs_queue.validator_failures.arn] },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = ["${aws_cloudwatch_log_group.lambda.arn}:*"] }
  ] })
}

# Phase 9 defines a narrow application publisher, NOT an infrastructure administrator.
# No pipeline, host remote-command permission or Terraform apply role is introduced.
resource "aws_iam_role" "ci" {
  name = "${var.name}-ci-lambda-publisher"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Federated = var.github_oidc_provider_arn }, Action = "sts:AssumeRoleWithWebIdentity"
    Condition = { StringEquals = {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:production"
    } }
  }] })
}
resource "aws_iam_role_policy" "ci" {
  name = "publish-validator-only"
  role = aws_iam_role.ci.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = ["lambda:UpdateFunctionCode", "lambda:GetFunctionConfiguration"], Resource = [aws_lambda_function.validator.arn]
  }] })
}
