import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('scheduled backup creates, encrypts and verifies the remote PostgreSQL archive', () => {
  const workflow = read('.github/workflows/backup-postgres.yml');
  const backup = read('scripts/backup-postgres.sh');
  const prune = read('scripts/prune-backups.sh');
  const restore = read('scripts/restore-postgres.sh');

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /NEON_BACKUP_DATABASE_URL/);
  assert.match(workflow, /DBRIJ_BACKUP_KEY_ID/);
  assert.match(backup, /pg_restore --list/);
  assert.match(backup, /gpg --batch/);
  assert.match(backup, /s3api head-object/);
  assert.match(prune, /\.dump\.gpg/);
  assert.match(restore, /sha256sum/);
  assert.match(restore, /gpg.*--decrypt/);
});

test('live monitor covers health and both RSS publishing surfaces', () => {
  const workflow = read('.github/workflows/render-keep-awake.yml');
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /\/feed\.xml/);
  assert.match(workflow, /\/api\/feeds/);
  assert.match(workflow, /id == "withubb"/);
});

test('Render deploy hook is gated on successful main-branch quality checks', () => {
  const workflow = read('.github/workflows/deploy-after-ci.yml');
  const blueprint = read('render.yaml');

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Portfolio quality checks/);
  assert.match(workflow, /conclusion == 'success'/);
  assert.match(workflow, /RENDER_DEPLOY_HOOK/);
  assert.match(blueprint, /autoDeploy: false/);
});
