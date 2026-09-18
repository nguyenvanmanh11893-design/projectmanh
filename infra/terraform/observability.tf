resource "aws_cloudwatch_log_metric_filter" "api_errors" {
  name           = "${var.name}-api_errors"
  log_group_name = aws_cloudwatch_log_group.app["api"].name
  pattern        = "{ $.event = \"http_request\" }"
  metric_transformation {
    name      = "ApiErrors"
    namespace = "CloudFiles/${var.name}"
    value     = "$.server_error"
  }
}
resource "aws_cloudwatch_log_metric_filter" "api_latency" {
  name           = "${var.name}-api_latency"
  log_group_name = aws_cloudwatch_log_group.app["api"].name
  pattern        = "{ $.event = \"http_request\" }"
  metric_transformation {
    name      = "ApiLatency"
    namespace = "CloudFiles/${var.name}"
    value     = "$.duration_ms"
  }
}
resource "aws_cloudwatch_log_metric_filter" "heartbeat" {
  name           = "${var.name}-heartbeat"
  log_group_name = aws_cloudwatch_log_group.app["worker"].name
  pattern        = "{ $.event = \"worker_sample\" }"
  metric_transformation {
    name      = "WorkerHeartbeat"
    namespace = "CloudFiles/${var.name}"
    value     = "$.heartbeat"
  }
}
resource "aws_cloudwatch_log_metric_filter" "backlog" {
  name           = "${var.name}-backlog"
  log_group_name = aws_cloudwatch_log_group.app["worker"].name
  pattern        = "{ $.event = \"worker_sample\" }"
  metric_transformation {
    name      = "JobBacklog"
    namespace = "CloudFiles/${var.name}"
    value     = "$.backlog"
  }
}
resource "aws_cloudwatch_log_metric_filter" "oldest" {
  name           = "${var.name}-oldest"
  log_group_name = aws_cloudwatch_log_group.app["worker"].name
  pattern        = "{ $.event = \"worker_sample\" }"
  metric_transformation {
    name      = "OldestDueJob"
    namespace = "CloudFiles/${var.name}"
    value     = "$.oldest"
  }
}
resource "aws_cloudwatch_log_metric_filter" "dead" {
  name           = "${var.name}-dead"
  log_group_name = aws_cloudwatch_log_group.app["worker"].name
  pattern        = "{ $.event = \"worker_sample\" }"
  metric_transformation {
    name      = "DeadJobs"
    namespace = "CloudFiles/${var.name}"
    value     = "$.dead"
  }
}
resource "aws_cloudwatch_metric_alarm" "ops_api_errors" {
  alarm_name          = "${var.name}-api_errors"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "ApiErrors"
  dimensions          = {}
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_api_latency" {
  alarm_name          = "${var.name}-api_latency"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "ApiLatency"
  dimensions          = {}
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 2000
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_worker" {
  alarm_name          = "${var.name}-worker"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "WorkerHeartbeat"
  dimensions          = {}
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_backlog" {
  alarm_name          = "${var.name}-backlog"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "JobBacklog"
  dimensions          = {}
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 100
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_oldest" {
  alarm_name          = "${var.name}-oldest"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "OldestDueJob"
  dimensions          = {}
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 600
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_dead" {
  alarm_name          = "${var.name}-dead"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "DeadJobs"
  dimensions          = {}
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_ec2" {
  alarm_name          = "${var.name}-ec2"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_cpu" {
  alarm_name          = "${var.name}-cpu"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_ram" {
  alarm_name          = "${var.name}-ram"
  namespace           = "CloudFiles/Host"
  metric_name         = "mem_used_percent"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_disk" {
  alarm_name          = "${var.name}-disk"
  namespace           = "CloudFiles/Host"
  metric_name         = "disk_used_percent"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_rds_cpu" {
  alarm_name          = "${var.name}-rds_cpu"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_rds_space" {
  alarm_name          = "${var.name}-rds_space"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 2147483648
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_rds_memory" {
  alarm_name          = "${var.name}-rds_memory"
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 134217728
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_lambda_errors" {
  alarm_name          = "${var.name}-lambda_errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.validator.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_lambda_throttles" {
  alarm_name          = "${var.name}-lambda_throttles"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.validator.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_metric_alarm" "ops_queue_age" {
  alarm_name          = "${var.name}-queue_age"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.validator_failures.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 300
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "${var.name}-operations"
  dashboard_body = jsonencode({ widgets = [
    { type = "metric", x = 0, y = 0, width = 8, height = 6, properties = { title = "api_errors", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "ApiErrors"]] } },
    { type = "metric", x = 8, y = 0, width = 8, height = 6, properties = { title = "api_latency", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "ApiLatency"]] } },
    { type = "metric", x = 16, y = 0, width = 8, height = 6, properties = { title = "worker", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "WorkerHeartbeat"]] } },
    { type = "metric", x = 0, y = 6, width = 8, height = 6, properties = { title = "backlog", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "JobBacklog"]] } },
    { type = "metric", x = 8, y = 6, width = 8, height = 6, properties = { title = "oldest", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "OldestDueJob"]] } },
    { type = "metric", x = 16, y = 6, width = 8, height = 6, properties = { title = "dead", region = local.region, period = 300, metrics = [["CloudFiles/${var.name}", "DeadJobs"]] } },
    { type = "metric", x = 0, y = 12, width = 8, height = 6, properties = { title = "ec2", region = local.region, period = 300, metrics = [["AWS/EC2", "StatusCheckFailed", "InstanceId", aws_instance.app.id]] } },
    { type = "metric", x = 8, y = 12, width = 8, height = 6, properties = { title = "cpu", region = local.region, period = 300, metrics = [["AWS/EC2", "CPUUtilization", "InstanceId", aws_instance.app.id]] } },
    { type = "metric", x = 16, y = 12, width = 8, height = 6, properties = { title = "ram", region = local.region, period = 300, metrics = [["CloudFiles/Host", "mem_used_percent", "InstanceId", aws_instance.app.id]] } },
    { type = "metric", x = 0, y = 18, width = 8, height = 6, properties = { title = "disk", region = local.region, period = 300, metrics = [["CloudFiles/Host", "disk_used_percent", "InstanceId", aws_instance.app.id]] } },
    { type = "metric", x = 8, y = 18, width = 8, height = 6, properties = { title = "rds_cpu", region = local.region, period = 300, metrics = [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.identifier]] } },
    { type = "metric", x = 16, y = 18, width = 8, height = 6, properties = { title = "rds_space", region = local.region, period = 300, metrics = [["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", aws_db_instance.main.identifier]] } },
    { type = "metric", x = 0, y = 24, width = 8, height = 6, properties = { title = "rds_memory", region = local.region, period = 300, metrics = [["AWS/RDS", "FreeableMemory", "DBInstanceIdentifier", aws_db_instance.main.identifier]] } },
    { type = "metric", x = 8, y = 24, width = 8, height = 6, properties = { title = "lambda_errors", region = local.region, period = 300, metrics = [["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.validator.function_name]] } },
    { type = "metric", x = 16, y = 24, width = 8, height = 6, properties = { title = "lambda_throttles", region = local.region, period = 300, metrics = [["AWS/Lambda", "Throttles", "FunctionName", aws_lambda_function.validator.function_name]] } },
    { type = "metric", x = 0, y = 30, width = 8, height = 6, properties = { title = "queue_age", region = local.region, period = 300, metrics = [["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.validator_failures.name]] } },
    { type = "metric", x = 8, y = 30, width = 8, height = 6, properties = { title = "API readiness", region = local.region, period = 60, stat = "Minimum", metrics = [["CloudFiles/${var.name}", "ApiReady"]] } },
    { type = "metric", x = 16, y = 30, width = 8, height = 6, properties = { title = "Failure queue depth", region = local.region, period = 300, stat = "Maximum", metrics = [["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.validator_failures.name]] } },
  ] })
}

resource "aws_cloudwatch_log_metric_filter" "api_ready" {
  name           = "${var.name}-api-ready"
  log_group_name = aws_cloudwatch_log_group.app["api"].name
  pattern        = "{ $.event = \"api_probe\" }"
  metric_transformation {
    name      = "ApiReady"
    namespace = "CloudFiles/${var.name}"
    value     = "$.ready"
  }
}
resource "aws_cloudwatch_metric_alarm" "api_ready" {
  alarm_name          = "${var.name}-api-ready"
  namespace           = "CloudFiles/${var.name}"
  metric_name         = "ApiReady"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
