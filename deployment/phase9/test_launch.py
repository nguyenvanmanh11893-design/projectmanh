import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("launch", Path(__file__).with_name("launch.py"))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.values = {"DB_HOST": "db.example", "DB_NAME": "files", "DB_USER": "app",
                       "DB_PASSWORD": "test-only-not-a-live-secret", "AWS_S3_BUCKET": "files-test",
                       "APP_ORIGIN": "https://files.example.com"}

    def response(self, kind="SecureString"):
        return subprocess.CompletedProcess([], 0, stdout=json.dumps({"Parameter": {
            "Type": kind, "Value": json.dumps(self.values)}}))

    def test_reject_missing_unknown_and_invalid_values(self):
        cases = [{}, {**self.values, "NODE_OPTIONS": "--import=/tmp/injected.js"},
                 {**self.values, "DB_PASSWORD": ""}, {**self.values, "DB_PORT": 3306},
                 {**self.values, "APP_ORIGIN": "http://files.example.com"},
                 {**self.values, "ORPHAN_CLEANUP_MODE": "delete"}]
        for value in cases:
            with self.subTest(value=list(value)), self.assertRaises(ValueError):
                launcher.runtime_values(json.dumps(value))

    def test_no_exec_on_aws_failure_or_plain_parameter(self):
        with patch.object(launcher.os, "execve") as execute:
            with patch.object(launcher.subprocess, "run", side_effect=subprocess.TimeoutExpired("aws", 30)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    launcher.launch("/test/runtime", ["/usr/bin/node", "server.js"])
            with patch.object(launcher.subprocess, "run", return_value=self.response("String")):
                with self.assertRaises(ValueError):
                    launcher.launch("/test/runtime", ["/usr/bin/node", "server.js"])
            execute.assert_not_called()

    def test_secret_only_in_child_env_and_no_inherited_credentials(self):
        with patch.object(launcher.subprocess, "run", return_value=self.response()) as fetch, \
                patch.object(launcher.os, "execve") as execute, \
                patch.dict(launcher.os.environ, {"AWS_SECRET_ACCESS_KEY": "untrusted", "NODE_OPTIONS": "injected"}):
            launcher.launch("/test/runtime", ["/usr/bin/node", "worker.js"])
            self.assertNotIn(self.values["DB_PASSWORD"], str(fetch.call_args))
            executable, arguments, env = execute.call_args.args
            self.assertNotIn(self.values["DB_PASSWORD"], str(arguments))
            self.assertNotIn("AWS_SECRET_ACCESS_KEY", env)
            self.assertNotIn("NODE_OPTIONS", env)
            self.assertEqual(env["DB_PASSWORD"], self.values["DB_PASSWORD"])
            self.assertEqual(env["DB_SSL_CA"], "/etc/cloud-files/rds-ca.pem")
            self.assertEqual(env["NODE_ENV"], "production")


if __name__ == "__main__":
    unittest.main()
