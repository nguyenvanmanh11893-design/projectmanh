resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "worker", "nginx", "ssm"])
  name              = "/${var.name}/${each.key}"
  retention_in_days = 30
  skip_destroy      = true
}
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name}-validator"
  retention_in_days = 30
  skip_destroy      = true
}
resource "aws_cloudwatch_log_group" "rds" {
  for_each          = toset(["error", "slowquery"])
  name              = "/aws/rds/instance/${var.name}/${each.key}"
  retention_in_days = 30
  skip_destroy      = true
}
resource "aws_sns_topic" "alerts" { name = "${var.name}-alerts" }
resource "aws_sns_topic_subscription" "alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_cloudwatch_metric_alarm" "failures" {
  alarm_name          = "${var.name}-validator-failures"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.validator_failures.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "destination_errors" {
  alarm_name          = "${var.name}-destination-delivery-failure"
  namespace           = "AWS/Lambda"
  metric_name         = "DestinationDeliveryFailures"
  dimensions          = { FunctionName = aws_lambda_function.validator.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
resource "aws_sns_topic" "billing" {
  provider = aws.billing
  name     = "${var.name}-billing"
}
resource "aws_sns_topic_subscription" "billing" {
  provider  = aws.billing
  topic_arn = aws_sns_topic.billing.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_sns_topic_policy" "billing" {
  provider = aws.billing
  arn      = aws_sns_topic.billing.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "Owner", Effect = "Allow", Principal = { AWS = "arn:${local.partition}:iam::${local.account}:root" }, Action = "SNS:*", Resource = aws_sns_topic.billing.arn },
    { Sid = "BudgetPublish", Effect = "Allow", Principal = { Service = "budgets.amazonaws.com" }, Action = "SNS:Publish", Resource = aws_sns_topic.billing.arn,
    Condition = { StringEquals = { "aws:SourceAccount" = local.account }, ArnLike = { "aws:SourceArn" = "arn:${local.partition}:budgets::${local.account}:budget/${var.name}-monthly" } } },
    { Sid = "AlarmPublish", Effect = "Allow", Principal = { Service = "cloudwatch.amazonaws.com" }, Action = "SNS:Publish", Resource = aws_sns_topic.billing.arn,
    Condition = { StringEquals = { "aws:SourceAccount" = local.account }, ArnLike = { "aws:SourceArn" = "arn:${local.partition}:cloudwatch:us-east-1:${local.account}:alarm:${var.name}-billing" } } }
  ] })
}
resource "aws_budgets_budget" "monthly" {
  provider     = aws.billing
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.billing.arn]
  }
  depends_on = [aws_sns_topic_policy.billing]
}
resource "aws_cloudwatch_metric_alarm" "billing" {
  provider            = aws.billing
  alarm_name          = "${var.name}-billing"
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  dimensions          = { Currency = "USD" }
  statistic           = "Maximum"
  period              = 21600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.monthly_budget_usd
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.billing.arn]
  depends_on          = [aws_sns_topic_policy.billing]
}
