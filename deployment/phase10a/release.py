"""Root-owned Linux release controller. Install separately, never from an artifact.
Config: /etc/cloud-files/release.json, root-owned mode 0600, no secrets.
Serializes stage/migrate/activate using flock; never deletes a release or data.
"""
import hashlib
from datetime import datetime
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/opt/cloud-files')


def run(args, **kwargs):
    return subprocess.run(args, check=True, timeout=600, **kwargs)


def safe_members(archive):
    members = archive.getmembers()
    for member in members:
        p = PurePosixPath(member.name)
        if p.is_absolute() or '..' in p.parts or any(v.startswith('.env') for v in p.parts):
            raise ValueError('Unsafe archive path')
        if not (member.isdir() or member.isfile() or member.issym()):
            raise ValueError('Unsafe archive type')
        if member.issym():
            # npm workspace/bin links are relative; resolve without filesystem IO.
            target = posixpath.normpath(str(p.parent / member.linkname))
            if posixpath.isabs(member.linkname) or target == '..' or target.startswith('../'):
                raise ValueError('Unsafe symlink')
    return members


def smoke(started=None):
    started = time.time() if started is None else started
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3000/health/ready', timeout=3) as response:
                if response.status != 200 or json.load(response).get('status') != 'ready':
                    raise ValueError('Not ready')
            with urllib.request.urlopen('http://127.0.0.1:3000/', timeout=3) as response:
                if response.status != 200 or b'<html' not in response.read(4096).lower():
                    raise ValueError('Frontend unavailable')
            run(['systemctl', 'is-active', '--quiet', 'cloud-files@worker'])
            with open('/var/log/cloud-files/worker.log', 'rb') as log_file:
                log_file.seek(0, 2)
                log_file.seek(max(0, log_file.tell() - 65536))
                recent = log_file.read().decode('utf-8', errors='replace').splitlines()
            healthy_worker = False
            for line in recent:
                try:
                    sample = json.loads(line)
                    if sample.get('event') == 'worker_sample' and sample.get('heartbeat') == 1 and datetime.fromisoformat(sample['timestamp'].replace('Z', '+00:00')).timestamp() >= started:
                        healthy_worker = True
                except (ValueError, KeyError, TypeError):
                    continue
            if not healthy_worker:
                raise ValueError('No fresh worker heartbeat')
            return
        except Exception:
            time.sleep(2)
    raise RuntimeError('Readiness/smoke failed')


def switch(target):
    link = BASE / 'current.next'
    if link.is_symlink():
        link.unlink()
    link.symlink_to(target, target_is_directory=True)
    link.replace(BASE / 'current')


def execute(action, sha, checksum, config):
    if action not in {'stage', 'migrate', 'deploy', 'rollback'} or not re.fullmatch('[0-9a-f]{40}', sha) or not re.fullmatch('[0-9a-f]{64}', checksum):
        raise ValueError('Invalid release arguments')
    releases = BASE / 'releases'
    releases.mkdir(exist_ok=True)
    target = releases / sha
    if action == 'stage':
        if target.exists():
            if (target / '.checksum').read_text().strip() != checksum:
                raise ValueError('Immutable release conflict')
            return
        with tempfile.TemporaryDirectory(dir=releases) as temp:
            archive_path = Path(temp) / 'release.tar.gz'
            run(['/usr/local/bin/aws', 's3', 'cp', f"s3://{config['bucket']}/releases/{sha}.tar.gz", str(archive_path), '--only-show-errors'])
            with archive_path.open('rb') as source:
                actual_checksum = hashlib.file_digest(source, 'sha256').hexdigest()
            if actual_checksum != checksum:
                raise ValueError('Checksum mismatch')
            extracted = Path(temp) / 'content'
            extracted.mkdir()
            with tarfile.open(archive_path) as archive:
                archive.extractall(extracted, members=safe_members(archive), filter='data')
            if json.loads((extracted / 'release.json').read_text())['commit'] != sha:
                raise ValueError('Manifest mismatch')
            (extracted / '.checksum').write_text(checksum)
            extracted.rename(target)
        return
    if not target.is_dir() or (target / '.checksum').read_text().strip() != checksum:
        raise ValueError('Stage verified artifact first')
    if action == 'migrate':
        # Explicit downtime: no old worker/API racing a schema upgrade.
        run(['systemctl', 'stop', 'cloud-files@server', 'cloud-files@worker'])
        run(['/usr/sbin/runuser', '-u', 'cloud-files', '--', '/usr/bin/python3', str(BASE / 'launch.py'), config['migration_parameter'], '/usr/bin/node', str(target / 'backend/scripts/migrate.js'), 'up'], cwd=target)
        return  # Failure intentionally leaves services stopped for operator review.
    previous = (BASE / 'current').resolve(strict=True)
    if previous.parent != releases.resolve():
        raise ValueError('Current release must be inside releases')
    # Read-only gate: an omitted migration must never activate incompatible code.
    run(['/usr/sbin/runuser', '-u', 'cloud-files', '--', '/usr/bin/python3', str(BASE / 'launch.py'), config['runtime_parameter'], '/usr/bin/node', str(target / 'backend/scripts/migrate.js'), 'check'], cwd=target)
    activate(target, previous)


def activate(target, previous):
    run(['systemctl', 'stop', 'cloud-files@server', 'cloud-files@worker'])
    try:
        switch(target)
        started = time.time()
        run(['systemctl', 'start', 'cloud-files@server', 'cloud-files@worker'])
        smoke(started)
    except Exception:
        run(['systemctl', 'stop', 'cloud-files@server', 'cloud-files@worker'])
        switch(previous)
        started = time.time()
        run(['systemctl', 'start', 'cloud-files@server', 'cloud-files@worker'])
        smoke(started)
        raise RuntimeError('Release failed; previous application restored') from None


if __name__ == '__main__':
    import fcntl
    try:
        with open('/run/cloud-files-release.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            execute(*sys.argv[1:], json.loads(Path('/etc/cloud-files/release.json').read_text()))
    except Exception:
        print('Release operation failed; inspect service state and reviewed runbook.', file=sys.stderr)
        sys.exit(1)
