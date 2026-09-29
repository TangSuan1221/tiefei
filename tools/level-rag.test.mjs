import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function cli(base, ...args) {
  return spawnSync(process.execPath, [path.join(base, 'tools/level-rag.mjs'), ...args], { cwd: base, encoding: 'utf8' });
}
test('natural language retrieves action, geometry and entry constraints with provenance', () => {
  for (const [query, expected] of [
    ['机械臂操作可以同时录像吗', 'MET-009'],
    ['通道净宽 门洞 掉头', 'MET-003'],
    ['MET-005', 'MET-005'],
    ['MET-010', 'MET-010'],
    ['第一章 埃利亚斯 撒谎', 'MET-020']
  ]) {
    const result = cli(root, 'query', query, '--top', '1', '--json');
    assert.equal(result.status, 0, result.stderr);
    const item = JSON.parse(result.stdout).results[0];
    assert.equal(item.id, expected, query);
    assert.ok(item.status && item.source && item.line > 0 && item.content && item.references.length);
  }
});
test('current index is deterministic, unknown terms are empty and bad flags fail', () => {
  assert.equal(cli(root, 'check').status, 0);
  const result = cli(root, 'query', 'zzunrelatednohitzz', '--json');
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).results, []);
  assert.notEqual(cli(root, 'query', '门洞', '--top', 'NaN').status, 0);
});
test('changed source refuses stale retrieval without modifying project sources', () => {
  const tempRoot = path.join(root, 'tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(tempRoot, 'level-rag-test-'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'rag/manifest.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(root, 'rag/level-metrics.index.json'), 'utf8'));
  const files = new Set(['tools/level-rag.mjs', 'rag/manifest.json', 'rag/level-metrics.index.json', ...Object.keys(index.snapshots), ...index.chunks.flatMap(c => c.references)]);
  try {
    for (const file of files) {
      const dest = path.join(fixture, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, file), dest);
    }
    assert.equal(cli(fixture, 'check').status, 0);
    fs.appendFileSync(path.join(fixture, manifest.evidenceFiles[0]), '\n// Changed code in test fixture only.\n');
    const stale = cli(fixture, 'query', '门洞');
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /Stale sources/);
    assert.equal(cli(fixture, 'build').status, 0);
    assert.equal(cli(fixture, 'check').status, 0);
    manifest.evidenceFiles.push('../outside-workspace-secret.txt');
    fs.writeFileSync(path.join(fixture, 'rag/manifest.json'), JSON.stringify(manifest));
    const escape = cli(fixture, 'build');
    assert.notEqual(escape.status, 0);
    assert.match(escape.stderr, /Non-workspace source/);
  } finally {
    // Delete only the verified, newly created fixture inside this workspace's tmp.
    const relative = path.relative(tempRoot, fs.realpathSync(fixture));
    assert.ok(relative.startsWith('level-rag-test-') && !relative.includes(path.sep));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
