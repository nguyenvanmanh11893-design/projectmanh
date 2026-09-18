#!/usr/bin/env python3
"""Fetch one SecureString into memory; exec app without shell or plaintext files."""
import json
import os
import subprocess
import sys

REQUIRED = {"DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "AWS_S3_BUCKET", "APP_ORIGIN"}
OPTIONAL = {"DB_PORT", "SESSION_TTL_DAYS", "UPLOAD_SESSION_TTL_MINUTES", "UPLOAD_POST_TTL_SECONDS",
            "WORKER_POLL_MS", "WORKER_SHUTDOWN_MS", "WORKER_LEASE_MS", "RECONCILE_INTERVAL_MS",
            "STALLED_UPLOAD_MINUTES", "ORPHAN_GRACE_HOURS", "ORPHAN_CLEANUP_MODE"}


def runtime_values(value):
    values = json.loads(value)
    if not isinstance(values, dict) or set(values) - REQUIRED - OPTIONAL or REQUIRED - set(values):
        raise ValueError("Invalid runtime keys")
    if any(not isinstance(v, str) or not v.strip() or "\0" in v for v in values.values()):
        raise ValueError("Invalid runtime values")
    if not values["APP_ORIGIN"].startswith("https://"):
        raise ValueError("HTTPS origin required")
    if values.get("ORPHAN_CLEANUP_MODE", "report-only") != "report-only":
        raise ValueError("Automatic orphan deletion requires a separate reviewed change")
    return values


def launch(parameter, command):
    if not parameter.startswith("/") or not command or not command[0].startswith("/"):
        raise ValueError("Absolute parameter and executable required")
    result = subprocess.run(
        ["/usr/local/bin/aws", "ssm", "get-parameter", "--region", "ap-southeast-1",
         "--name", parameter, "--with-decryption", "--output", "json"],
        check=True, capture_output=True, text=True, timeout=30,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "AWS_PAGER": ""},
    )
    parameter_data = json.loads(result.stdout)["Parameter"]
    if parameter_data["Type"] != "SecureString":
        raise ValueError("SecureString required")
    values = runtime_values(parameter_data["Value"])
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "NODE_ENV": "production", "PORT": "3000",
           "AWS_REGION": "ap-southeast-1", "TRUST_PROXY": "true",
           "DB_SSL_CA": "/etc/cloud-files/rds-ca.pem", "ORPHAN_CLEANUP_MODE": "report-only"}
    env.update(values)
    os.execve(command[0], command, env)


if __name__ == "__main__":
    try:
        launch(sys.argv[1], sys.argv[2:])
    except Exception:
        # AWS errors, JSON, and exception arguments can contain credentials. Never echo them.
        print("Runtime bootstrap failed; service not started.", file=sys.stderr)
        sys.exit(1)
