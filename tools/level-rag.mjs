import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Explicit allowlist only: never crawl .env, assets, user documents, or external services.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'rag', 'manifest.json');
const indexPath = path.join(root, 'rag', 'level-metrics.index.json');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = text => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
function localPath(relative) {
  const absolute = path.resolve(root, relative);
  const back = path.relative(root, absolute);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) throw new Error(`Non-workspace source: ${relative}`);
  return absolute;
}
function tokens(text) {
  const normalized = text.toLowerCase().normalize('NFKC');
  const result = normalized.match(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g) ?? [];
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...run];
    if (chars.length === 1) result.push(run);
    for (let i = 0; i + 1 < chars.length; i++) result.push(chars[i] + chars[i + 1]);
  }
  return result;
}
function manifest() {
  const raw = clean(fs.readFileSync(manifestPath, 'utf8'));
  const value = JSON.parse(raw);
  if (value.schemaVersion !== 1 || !value.documents?.length) throw new Error('Unsupported or empty manifest');
  return { raw, value };
}
function buildIndex() {
  const { raw, value } = manifest();
  const snapshots = {};
  for (const source of new Set([...value.documents.map(d => d.path), ...value.evidenceFiles])) {
    snapshots[source] = digest(clean(fs.readFileSync(localPath(source), 'utf8')));
  }
  const chunks = [];
  for (const doc of value.documents) {
    const lines = clean(fs.readFileSync(localPath(doc.path), 'utf8')).split('\n');
    const starts = lines.flatMap((line, i) => /^## MET-\d{3}\s/.test(line) ? [i] : []);
    if (!starts.length) throw new Error(`No MET sections in ${doc.path}`);
    for (let i = 0; i < starts.length; i++) {
      const begin = starts[i], end = starts[i + 1] ?? lines.length;
      const title = lines[begin].slice(3);
      const id = title.match(/^MET-\d{3}/)[0];
      const content = lines.slice(begin + 1, end).join('\n').trim();
      const status = content.match(/^状态：([^。]+)/m)?.[1];
      if (!status) throw new Error(`Missing status: ${id}`);
      const references = [...new Set([...content.matchAll(/`((?:src|docs|tools)\/[^`]+)`/g)].map(m => m[1]))];
      for (const ref of references) {
        if (!fs.existsSync(localPath(ref))) throw new Error(`Missing reference in ${id}: ${ref}`);
        // References explicitly written in the approved document join its evidence allowlist.
        snapshots[ref] ??= digest(clean(fs.readFileSync(localPath(ref), 'utf8')));
      }
      const frequencies = {};
      for (const token of [...tokens(title), ...tokens(title), ...tokens(title), ...tokens(content)]) frequencies[token] = (frequencies[token] ?? 0) + 1;
      chunks.push({ id, title, status, runtimeProfile: value.defaultRuntimeProfile,
        scopeNote: '主游戏为默认范围；条目正文中标明的首关、独立探索和历史模式例外必须一并引用。',
        source: doc.path, line: begin + 1, endLine: end, priority: doc.priority,
        references, content, frequencies, length: Object.values(frequencies).reduce((a, b) => a + b, 0) });
    }
  }
  if (new Set(chunks.map(c => c.id)).size !== chunks.length) throw new Error('Duplicate metric ID');
  const documentFrequency = {};
  for (const chunk of chunks) for (const token of Object.keys(chunk.frequencies)) documentFrequency[token] = (documentFrequency[token] ?? 0) + 1;
  return { schemaVersion: 1, revision: value.revision, mode: 'local-lexical-bm25',
    manifestHash: digest(raw), snapshots, documentFrequency,
    averageLength: chunks.reduce((n, c) => n + c.length, 0) / chunks.length, chunks };
}
function loadFresh() {
  if (!fs.existsSync(indexPath)) throw new Error('Index missing. Run: node tools/level-rag.mjs build');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const { raw } = manifest();
  if (index.schemaVersion !== 1 || index.manifestHash !== digest(raw)) throw new Error('Manifest changed; review and rebuild the index.');
  const stale = Object.entries(index.snapshots).filter(([name, hash]) => !fs.existsSync(localPath(name)) || digest(clean(fs.readFileSync(localPath(name), 'utf8'))) !== hash).map(([name]) => name);
  if (stale.length) throw new Error(`Stale sources: ${stale.join(', ')}. Review code facts and metrics, then rebuild; rebuilding alone does not verify semantics.`);
  return index;
}
function search(index, query, top) {
  const queryTokens = [...new Set(tokens(query))];
  return index.chunks.map(chunk => {
    let score = 0;
    for (const token of queryTokens) {
      const tf = chunk.frequencies[token] ?? 0;
      if (!tf) continue;
      const df = index.documentFrequency[token] ?? 0;
      const idf = Math.log(1 + (index.chunks.length - df + 0.5) / (df + 0.5));
      score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * chunk.length / index.averageLength));
    }
    if (query.toUpperCase().includes(chunk.id)) score += 100;
    return { ...chunk, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, top)
    .map(({ frequencies, length, priority, ...result }) => ({ ...result, score: Number(result.score.toFixed(4)) }));
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'build') {
    const index = buildIndex();
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
    console.log(`Indexed ${index.chunks.length} metrics; ${Object.keys(index.snapshots).length} source fingerprints. Local retrieval only.`);
  } else if (command === 'check') {
    const index = loadFresh();
    // Full reconstruction also validates IDs, references and deterministic content.
    if (JSON.stringify(index) !== JSON.stringify(buildIndex())) throw new Error('Index differs from current sources; review and rebuild.');
    console.log(`PASS: ${index.chunks.length} metrics, all sources and references current.`);
  } else if (command === 'query') {
    let top = 4, json = false;
    const terms = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') json = true;
      else if (args[i] === '--top') top = Number(args[++i]);
      else if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
      else terms.push(args[i]);
    }
    if (!terms.length || !Number.isInteger(top) || top < 1 || top > 23) throw new Error('Supply a query and --top from 1 to 23.');
    const query = terms.join(' '), results = search(loadFresh(), query, top);
    if (json) console.log(JSON.stringify({ query, mode: 'local-lexical-bm25', results }, null, 2));
    else if (!results.length) console.log('No matching metric. Read docs/level-metrics.md; do not infer a missing capability.');
    else for (const result of results) console.log(`[${result.id}] ${result.title}\n状态：${result.status}\n来源：${result.source}:${result.line}\n${result.content}\n`);
  } else {
    throw new Error('Usage: node tools/level-rag.mjs build | check | query "问题" [--top 4] [--json]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
