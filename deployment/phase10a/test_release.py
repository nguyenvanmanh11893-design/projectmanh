import io
import json
from pathlib import Path
import tarfile
import tempfile
import os
import hashlib
import unittest
from unittest.mock import patch
import release
import cd
import artifact


class ReleaseTests(unittest.TestCase):
    def test_artifact_archive_contains_sha_and_nested_dependencies_but_rejects_env(self):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                for name in ['backend/src', 'backend/scripts', 'backend/database/migrations', 'frontend/dist', 'node_modules', 'backend/node_modules']:
                    Path(name).mkdir(parents=True, exist_ok=True)
                for name in ['backend/package.json', 'frontend/package.json', 'package.json', 'package-lock.json', 'backend/node_modules/dependency.js']:
                    Path(name).write_text('{}')
                sha = 'a' * 40
                with patch.object(artifact.subprocess, 'check_output', side_effect=[sha, '']):
                    artifact.build(sha, 'output')
                archive_path = Path('output') / f'{sha}.tar.gz'
                with tarfile.open(archive_path) as archive:
                    self.assertIn('backend/node_modules/dependency.js', archive.getnames())
                    self.assertEqual(json.load(archive.extractfile('release.json'))['commit'], sha)
                with archive_path.open('rb') as source:
                    self.assertEqual(hashlib.file_digest(source, 'sha256').hexdigest(), (Path('output') / f'{sha}.sha256').read_text().strip())
                Path('backend/src/.env').write_text('test canary')
                with patch.object(artifact.subprocess, 'check_output', side_effect=[sha, '']), self.assertRaises(ValueError):
                    artifact.build(sha, 'rejected-output')
            finally:
                os.chdir(original)

    def test_artifact_rejects_wrong_sha_or_dirty_sources_before_writing(self):
        with patch.object(artifact.subprocess, 'check_output', return_value='b' * 40), self.assertRaises(ValueError):
            artifact.build('a' * 40, 'unused-output')
        with patch.object(artifact.subprocess, 'check_output', side_effect=['a' * 40, 'backend/src/app.js']), self.assertRaises(ValueError):
            artifact.build('a' * 40, 'unused-output')

    def test_archive_rejects_traversal_secrets_devices_and_escaping_links(self):
        for name, kind, link in [('../escape', tarfile.REGTYPE, ''), ('/escape', tarfile.REGTYPE, ''),
                                 ('.env', tarfile.REGTYPE, ''), ('device', tarfile.CHRTYPE, ''),
                                 ('link', tarfile.SYMTYPE, '../../escape')]:
            with self.subTest(name=name):
                data = io.BytesIO()
                with tarfile.open(fileobj=data, mode='w') as archive:
                    item = tarfile.TarInfo(name); item.type = kind; item.linkname = link
                    archive.addfile(item)
                data.seek(0)
                with tarfile.open(fileobj=data) as archive, self.assertRaises(ValueError):
                    release.safe_members(archive)

    def test_failed_smoke_restores_previous_and_still_fails_deployment(self):
        with patch.object(release, 'run') as run, patch.object(release, 'switch') as switch, \
                patch.object(release, 'smoke', side_effect=[RuntimeError('not ready'), None]):
            with self.assertRaises(RuntimeError):
                release.activate(Path('new'), Path('previous'))
            self.assertEqual([call.args[0] for call in switch.call_args_list], [Path('new'), Path('previous')])
            self.assertEqual(sum(call.args[0][1] == 'stop' for call in run.call_args_list), 2)

    def test_migration_failure_does_not_activate_or_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); sha = 'a' * 40; checksum = 'b' * 64
            target = base / 'releases' / sha; target.mkdir(parents=True)
            (target / '.checksum').write_text(checksum)
            with patch.object(release, 'BASE', base), patch.object(release, 'run', side_effect=[None, RuntimeError('migration')]) as run, patch.object(release, 'switch') as switch:
                with self.assertRaises(RuntimeError):
                    release.execute('migrate', sha, checksum, {'migration_parameter': '/test/migration'})
                switch.assert_not_called()
                self.assertFalse(any('start' in call.args[0] for call in run.call_args_list))

    def test_cd_rejects_disabled_environment_wrong_sha_pr_and_rollback_migration(self):
        env = {'CD_ENABLED': 'true', 'RELEASE_SHA': 'a' * 40, 'RUN_ID': '123', 'INSTANCE_ID': 'i-abcdef',
               'RELEASE_BUCKET': 'release-bucket', 'DOCUMENT_NAME': 'release', 'PUBLIC_ORIGIN': 'https://files.example.com',
               'OPERATION': 'deploy', 'MIGRATE': 'false', 'GITHUB_REPOSITORY': 'owner/repo'}
        good = {'conclusion': 'success', 'head_sha': 'a' * 40, 'head_branch': 'main', 'path': '.github/workflows/ci.yml', 'event': 'push'}
        with patch.object(cd, 'call', return_value=json.dumps(good)):
            cd.verify(env)
            for changed in [{'CD_ENABLED': 'false'}, {'RELEASE_SHA': '$(bad)'}, {'OPERATION': 'rollback', 'MIGRATE': 'true'}]:
                with self.assertRaises(ValueError):
                    cd.verify({**env, **changed})
        for changed in [{'head_sha': 'b' * 40}, {'event': 'pull_request'}, {'path': '.github/workflows/other.yml'}, {'conclusion': 'failure'}]:
            with patch.object(cd, 'call', return_value=json.dumps({**good, **changed})), self.assertRaises(ValueError):
                cd.verify(env)


if __name__ == '__main__':
    unittest.main()
