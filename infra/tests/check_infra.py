"""Offline parsed-HCL guardrails; no Terraform plan, credentials, .env or AWS calls.

Requires python-hcl2==8.1.4. Mutation cases prove dangerous changes are rejected;
these checks are not an IAM simulator or live infrastructure acceptance.
"""
import copy
import json
from pathlib import Path
import unittest
import hcl2

ROOT = Path(__file__).resolve().parents[1] / "terraform"


def normalize(value):
    # python-hcl2 8 preserves quoted HCL labels/string literals.
    if isinstance(value, dict):
        return {normalize(k): normalize(v) for k, v in value.items() if not k.startswith("__")}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, str) and value.startswith('"') and value.endswith('"'):
        return json.loads(value)
    return value


def load_resources():
    resources = {}
    for path in ROOT.glob("*.tf"):
        with path.open(encoding="utf-8") as source:
            parsed = normalize(hcl2.load(source))
        for entry in parsed.get("resource", []):
            for kind, instances in entry.items():
                for name, body in instances.items():
                    resources[f"{kind}.{name}"] = body
    return resources


def enforce(r):
    def require(condition, rule):
        if not condition:
            raise ValueError(rule)

    forbidden = ("aws_nat_gateway.", "aws_lb.", "aws_alb.", "aws_ecs_", "aws_apigateway", "aws_api_gateway", "aws_dynamodb")
    require(not any(key.startswith(forbidden) for key in r), "scope")
    require(r["aws_vpc.main"]["cidr_block"] == "10.0.0.0/16", "vpc")
    require(not r["aws_route_table.db"].get("route"), "private DB routes")
    db = r["aws_db_instance.main"]
    require(db["multi_az"] is False and db["publicly_accessible"] is False, "single private DB")
    require(db["storage_encrypted"] and db["backup_retention_period"] >= 7, "DB backups")
    require(db["manage_master_user_password"] and "password" not in db, "no Terraform DB secret")
    require(db["deletion_protection"] and not db["skip_final_snapshot"] and not db["delete_automated_backups"], "DB retention")
    for name in ["aws_db_instance.main", "aws_s3_bucket.files", "aws_kms_key.parameters", "aws_instance.app", "aws_sqs_queue.validator_failures"]:
        require(r[name]["lifecycle"][0]["prevent_destroy"] is True, "destroy guard")
    require(not r["aws_s3_bucket.files"]["force_destroy"], "bucket retain")
    instance = r["aws_instance.app"]
    require("user_data" not in instance and "user_data_base64" not in instance and "key_name" not in instance, "no bootstrap secrets or SSH")
    require(instance["metadata_options"][0]["http_tokens"] == "required", "IMDSv2")
    disk = instance["root_block_device"][0]
    require(disk["encrypted"] and not disk["delete_on_termination"], "EBS retain")
    require({rule["from_port"] for rule in r["aws_security_group.ec2"]["ingress"]} == {80, 443}, "web ingress")
    ingress = r["aws_security_group.db"]["ingress"]
    require(len(ingress) == 1 and ingress[0]["from_port"] == 3306 and ingress[0]["to_port"] == 3306
            and ingress[0]["security_groups"] == ["${aws_security_group.ec2.id}"]
            and not ingress[0].get("cidr_blocks"), "DB source SG")
    require(r["aws_vpc_endpoint.s3"]["vpc_endpoint_type"] == "Gateway", "S3 endpoint")
    bucket_policy = r["aws_s3_bucket_policy.files"]["policy"]
    require("SecureTransport" in bucket_policy and "SourceVpce" not in bucket_policy and "sourceVpce" not in bucket_policy, "browser TLS policy")
    require(all(r["aws_s3_bucket_public_access_block.files"][key] for key in
                ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]), "private bucket")
    require(r["aws_s3_bucket_versioning.files"]["versioning_configuration"][0]["status"] == "Enabled", "versioning")
    lifecycle = r["aws_s3_bucket_lifecycle_configuration.temporary"]["dynamic"][0]["rule"]
    require(lifecycle["for_each"] == '${toset(["incoming/", "processing-results/"])}', "temporary prefixes only")
    require(lifecycle["content"][0]["filter"][0]["prefix"] == "${rule.value}", "prefix filter")
    notification = r["aws_s3_bucket_notification.incoming"]["lambda_function"]
    require(len(notification) == 1 and notification[0]["filter_prefix"] == "incoming/", "no notification loop")
    require("vpc_config" not in r["aws_lambda_function.validator"], "Lambda outside VPC")
    destination = r["aws_lambda_function_event_invoke_config.validator"]["destination_config"][0]["on_failure"][0]["destination"]
    require(destination == "${aws_sqs_queue.validator_failures.arn}", "failure destination")
    for name, body in r.items():
        if name.startswith("aws_cloudwatch_log_group."):
            require(body["retention_in_days"] == 30 and body["skip_destroy"], "log retention")
        require(not name.startswith("aws_ssm_parameter."), "no state secret values")
    require(r["aws_cloudwatch_metric_alarm.billing"]["provider"] == "${aws.billing}", "billing region")
    ci = r["aws_iam_role.ci"]["assume_role_policy"]
    require("StringEquals" in ci and ":environment:production" in ci and "StringLike" not in ci, "CI exact trust")
    policy = r["aws_iam_role_policy.ci"]["policy"]
    require("lambda:UpdateFunctionCode" in policy and "PassRole" not in policy and '"*"' not in policy, "CI scope")
    require("s3:PutObject" in r["aws_iam_role_policy.validator"]["policy"] and "objects/*" not in r["aws_iam_role_policy.validator"]["policy"], "validator cannot finalize")
    for name, body in r.items():
        if name.startswith(("aws_cloudwatch_metric_alarm.", "aws_cloudwatch_log_metric_filter.")):
            require(not any(key in json.dumps(body.get("dimensions", {})) for key in ["user_id", "file_id", "job_id", "request_id"]), "metric cardinality")
            for transform in body.get("metric_transformation", []):
                require(not transform.get("dimensions"), "log metric cardinality")
    require(r["aws_cloudwatch_metric_alarm.api_ready"]["treat_missing_data"] == "breaching", "missing readiness")
    require(r["aws_cloudwatch_metric_alarm.ops_worker"]["treat_missing_data"] == "breaching", "missing heartbeat")
    deploy = r["aws_iam_role.deploy"]["assume_role_policy"]
    require("StringEquals" in deploy and "github_deploy_subject" in deploy and "StringLike" not in deploy, "deploy exact trust")
    require("AWS-RunShellScript" not in r["aws_iam_role_policy.deploy"]["policy"], "no arbitrary remote shell")
    require(r["aws_s3_bucket.releases"]["force_destroy"] is False, "retain rollback artifacts")


class InfrastructureGuards(unittest.TestCase):
    def test_configuration(self):
        enforce(load_resources())

    def test_dangerous_mutations_are_rejected(self):
        cases = [
            ("public RDS", lambda r: r["aws_db_instance.main"].update(publicly_accessible=True)),
            ("DB password in state", lambda r: r["aws_db_instance.main"].update(password="unsafe")),
            ("IMDSv1", lambda r: r["aws_instance.app"]["metadata_options"][0].update(http_tokens="optional")),
            ("SSH", lambda r: r["aws_security_group.ec2"]["ingress"].append({"from_port": 22})),
            ("notification loop", lambda r: r["aws_s3_bucket_notification.incoming"]["lambda_function"][0].update(filter_prefix="")),
            ("objects expiry", lambda r: r["aws_s3_bucket_lifecycle_configuration.temporary"]["dynamic"][0]["rule"].update(for_each='${toset(["objects/"])}')),
            ("browser VPCE denial", lambda r: r["aws_s3_bucket_policy.files"].update(policy="aws:SourceVpce aws:SecureTransport")),
            ("wrong billing region", lambda r: r["aws_cloudwatch_metric_alarm.billing"].update(provider="${aws}")),
            ("destroy guard removed", lambda r: r["aws_s3_bucket.files"]["lifecycle"][0].update(prevent_destroy=False)),
            ("NAT", lambda r: r.update({"aws_nat_gateway.unwanted": {}})),
            ("high cardinality", lambda r: r["aws_cloudwatch_metric_alarm.ops_backlog"].update(dimensions={"user_id": "unsafe"})),
            ("missing heartbeat healthy", lambda r: r["aws_cloudwatch_metric_alarm.ops_worker"].update(treat_missing_data="notBreaching")),
            ("arbitrary remote shell", lambda r: r["aws_iam_role_policy.deploy"].update(policy="AWS-RunShellScript")),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                resources = copy.deepcopy(load_resources())
                mutate(resources)
                with self.assertRaises(ValueError):
                    enforce(resources)


if __name__ == "__main__":
    unittest.main()
