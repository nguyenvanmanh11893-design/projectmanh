"""Build a SHA-labelled archive from an explicit allowlist; never include .env."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile


def build(sha, output):
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Full commit SHA required')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if sha != actual:
        raise ValueError('SHA does not match checkout')
    if subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'backend', 'frontend', 'package.json', 'package-lock.json'], text=True).strip():
        raise ValueError('Refusing to label modified tracked sources with a commit SHA')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / 'release.json'
    manifest.write_text(json.dumps({'commit': sha}), encoding='utf-8')
    target = output / f'{sha}.tar.gz'
    def allowed(info):
        parts = Path(info.name).parts
        if any(p.startswith('.env') or p in {'__pycache__', '.cache'} for p in parts):
            raise ValueError('Forbidden artifact content')
        return info
    with tarfile.open(target, 'w:gz') as archive:
        for name in ['backend/src', 'backend/scripts', 'backend/database/migrations', 'backend/package.json',
                     'frontend/dist', 'frontend/package.json', 'package.json', 'package-lock.json', 'node_modules']:
            archive.add(name, arcname=name, filter=allowed)
        for name in ['backend/node_modules', 'frontend/node_modules']:
            if Path(name).exists():
                archive.add(name, arcname=name, filter=allowed)
        archive.add(manifest, arcname='release.json')
    with target.open('rb') as source:
        checksum = hashlib.file_digest(source, 'sha256').hexdigest()
    (output / f'{sha}.sha256').write_text(checksum + '\n', encoding='ascii')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
