"""GitHub runner only. No shell interpolation of workflow inputs or AWS keys."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request


def call(args):
    return subprocess.check_output(args, text=True).strip()


def verify(env):
    if env.get('CD_ENABLED') != 'true':
        raise ValueError('Set protected environment CD_ENABLED=true after bootstrap review')
    for key, pattern in {'RELEASE_SHA': '[0-9a-f]{40}', 'RUN_ID': '[0-9]+', 'INSTANCE_ID': 'i-[0-9a-f]+',
                         'RELEASE_BUCKET': '[a-z0-9][a-z0-9.-]{2,62}', 'DOCUMENT_NAME': '[A-Za-z0-9_-]+',
                         'PUBLIC_ORIGIN': 'https://[a-z0-9.-]+'}.items():
        if not re.fullmatch(pattern, env.get(key, '')):
            raise ValueError(f'Invalid {key}')
    if env['OPERATION'] not in {'deploy', 'rollback'} or (env['OPERATION'] == 'rollback' and env['MIGRATE'] == 'true'):
        raise ValueError('Rollback cannot migrate')
    run = json.loads(call(['gh', 'api', f"repos/{env['GITHUB_REPOSITORY']}/actions/runs/{env['RUN_ID']}"]))
    if not (run['conclusion'] == 'success' and run['head_sha'] == env['RELEASE_SHA'] and run['head_branch'] == 'main'
            and run['path'] == '.github/workflows/ci.yml' and run['event'] in {'push', 'workflow_dispatch'}):
        raise ValueError('Artifact must come from successful main CI for exact SHA')


def main(action):
    env = os.environ
    if action == 'verify':
        verify(env)
        return
    if action == 'smoke':
        for path in ['/health/ready', '/']:
            with urllib.request.urlopen(env['PUBLIC_ORIGIN'] + path, timeout=10) as response:
                if response.status != 200:
                    raise ValueError('HTTPS smoke failed')
                if path == '/health/ready' and json.load(response).get('status') != 'ready':
                    raise ValueError('HTTPS readiness failed')
        return
    sha = env['RELEASE_SHA']
    archive = Path('release-output') / f'{sha}.tar.gz'
    checksum = (Path('release-output') / f'{sha}.sha256').read_text().strip()
    with archive.open('rb') as source:
        actual_checksum = hashlib.file_digest(source, 'sha256').hexdigest()
    if actual_checksum != checksum:
        raise ValueError('Artifact checksum mismatch')
    if action == 'stage':
        call(['aws', 's3', 'cp', str(archive), f"s3://{env['RELEASE_BUCKET']}/releases/{sha}.tar.gz", '--only-show-errors'])
    operation = env['OPERATION'] if action == 'activate' else action
    command = json.loads(call(['aws', 'ssm', 'send-command', '--instance-ids', env['INSTANCE_ID'],
        '--document-name', env['DOCUMENT_NAME'], '--parameters', json.dumps({'Action': [operation], 'Sha': [sha], 'Checksum': [checksum]}), '--output', 'json']))['Command']['CommandId']
    for _ in range(180):
        time.sleep(5)
        try:
            result = json.loads(call(['aws', 'ssm', 'get-command-invocation', '--command-id', command, '--instance-id', env['INSTANCE_ID'], '--output', 'json']))
        except subprocess.CalledProcessError:
            continue
        if result['Status'] == 'Success':
            return
        if result['Status'] not in {'Pending', 'InProgress', 'Delayed'}:
            raise RuntimeError('Remote operation failed; inspect host state without printing secrets')
    raise TimeoutError('Remote command timed out; do not issue another release until host state is reviewed')


if __name__ == '__main__':
    main(sys.argv[1])
