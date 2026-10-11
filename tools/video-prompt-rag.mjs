import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Local lexical retrieval plus deterministic template composition for level video prompts.
// Explicit allowlist only: never crawl .env, assets, user documents, or external services.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'rag', 'video-prompt.manifest.json');
const indexPath = path.join(root, 'rag', 'video-prompt.index.json');
const SECTION = /^## ((?:VR|VP|PT)-\d{3})\s/;
const MAX_PROMPT = 2200;
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
function blocks(content) {
  const found = {};
  for (const m of content.matchAll(/```([a-z-]+)\n([\s\S]*?)\n```/g)) {
    if (found[m[1]] !== undefined) throw new Error(`Duplicate ${m[1]} block`);
    found[m[1]] = m[2].trim();
  }
  return found;
}
function sections() {
  const { raw, value } = manifest();
  const chunks = [];
  for (const doc of value.documents) {
    const lines = clean(fs.readFileSync(localPath(doc.path), 'utf8')).split('\n');
    if (doc.kind === 'video-library') {
      const library = JSON.parse(lines.join('\n'));
      const entries = [...Object.entries(library.profiles).map(([name, profile], i) => ({id:`AP-${String(i+1).padStart(3,'0')}`,name,...profile})), ...library.shots];
      for (const entry of entries) {
        const marker = entry.name ? `"${entry.name}"` : `"${entry.id}"`;
        const line = lines.findIndex(line=>line.includes(marker))+1;
        chunks.push({id:entry.id,title:entry.id+' '+(entry.name ?? entry.sceneId+' '+entry.choiceId),status:'IMPLEMENTED / TEST',source:doc.path,line,endLine:line,content:JSON.stringify(entry,null,2),blocks:{}});
      }
      continue;
    }
    const starts = lines.flatMap((line, i) => SECTION.test(line) ? [i] : []);
    if (!starts.length) throw new Error(`No VR/VP/PT sections in ${doc.path}`);
    for (let i = 0; i < starts.length; i++) {
      const begin = starts[i], end = starts[i + 1] ?? lines.length;
      const title = lines[begin].slice(3);
      const id = title.match(/^(?:VR|VP|PT)-\d{3}/)[0];
      const content = lines.slice(begin + 1, end).join('\n').trim();
      const status = content.match(/^状态：([^。（]+)/m)?.[1];
      if (!status) throw new Error(`Missing status: ${id}`);
      let parsed;
      try { parsed = blocks(content); } catch (error) { throw new Error(`${id}: ${error.message}`); }
      chunks.push({ id, title, status, source: doc.path, line: begin + 1, endLine: end, content, blocks: parsed });
    }
  }
  if (new Set(chunks.map(c => c.id)).size !== chunks.length) throw new Error('Duplicate prompt section ID');
  return { raw, value, chunks };
}
function buildIndex() {
  const { raw, value, chunks } = sections();
  const snapshots = {};
  for (const source of new Set([...value.documents.map(d => d.path), ...value.evidenceFiles])) {
    snapshots[source] = digest(clean(fs.readFileSync(localPath(source), 'utf8')));
  }
  const indexed = chunks.map(chunk => {
    const references = [...new Set([...chunk.content.matchAll(/`((?:src|docs|tools|qa)\/[^`]+)`/g)].map(m => m[1]))];
    for (const ref of references) {
      if (!fs.existsSync(localPath(ref))) throw new Error(`Missing reference in ${chunk.id}: ${ref}`);
      snapshots[ref] ??= digest(clean(fs.readFileSync(localPath(ref), 'utf8')));
    }
    const frequencies = {};
    for (const token of [...tokens(chunk.title), ...tokens(chunk.title), ...tokens(chunk.title), ...tokens(chunk.content)]) frequencies[token] = (frequencies[token] ?? 0) + 1;
    const { blocks: _blocks, ...rest } = chunk;
    return { ...rest, kind: chunk.id.slice(0, 2), references, frequencies, length: Object.values(frequencies).reduce((a, b) => a + b, 0) };
  });
  const documentFrequency = {};
  for (const chunk of indexed) for (const token of Object.keys(chunk.frequencies)) documentFrequency[token] = (documentFrequency[token] ?? 0) + 1;
  return { schemaVersion: 1, revision: value.revision, scope: value.scope, mode: 'local-lexical-bm25',
    manifestHash: digest(raw), snapshots, documentFrequency,
    averageLength: indexed.reduce((n, c) => n + c.length, 0) / indexed.length, chunks: indexed };
}
function loadFresh() {
  if (!fs.existsSync(indexPath)) throw new Error('Index missing. Run: node tools/video-prompt-rag.mjs build');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const { raw } = manifest();
  if (index.schemaVersion !== 1 || index.manifestHash !== digest(raw)) throw new Error('Manifest changed; review and rebuild the index.');
  const stale = Object.entries(index.snapshots).filter(([name, hash]) => !fs.existsSync(localPath(name)) || digest(clean(fs.readFileSync(localPath(name), 'utf8'))) !== hash).map(([name]) => name);
  if (stale.length) throw new Error(`Stale sources: ${stale.join(', ')}. Review prompt facts against the code, then rebuild; rebuilding alone does not verify semantics.`);
  return index;
}
function search(index, query, top, kind) {
  const queryTokens = [...new Set(tokens(query))];
  return index.chunks.filter(c => !kind || c.kind === kind).map(chunk => {
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
    .map(({ frequencies, length, ...result }) => ({ ...result, score: Number(result.score.toFixed(4)) }));
}

// Template composition: VR-001 prefix + PT body + VR-002 suffix, slots resolved from VR-005, PT defaults and --set.
function composeParts(byId, id, overrides) {
  const template = byId.get(id);
  if (!template || !id.startsWith('PT-')) throw new Error(`Unknown template ${id}`);
  const body = template.blocks.prompt;
  if (!body) throw new Error(`${id} has no prompt block`);
  const catalog = JSON.parse(byId.get('VR-005').blocks.slots);
  const live = Object.keys(catalog.monster ?? {}).sort().join(), trace = Object.keys(catalog.monster_trace ?? {}).sort().join();
  if (!live || live !== trace) throw new Error('VR-005 monster and monster_trace must define the same keys');
  // Variant slots stay silent unless a template or the caller selects a variant.
  const values = Object.fromEntries(Object.entries(catalog).map(([key, entry]) => [key, typeof entry === 'string' ? entry : '']));
  Object.assign(values, { lamp: 'off', pulse: 'off', hull: 'intact', corpse: 'none', elias: 'absent', monster: 'absent' });
  Object.assign(values, template.blocks.defaults ? JSON.parse(template.blocks.defaults) : {}, overrides);
  for (const [key, value] of Object.entries(overrides)) {
    const entry = catalog[key];
    if (!entry) throw new Error(`Unknown slot ${key}`);
    if (typeof entry === 'object' && !(value in entry)) throw new Error(`Slot ${key} must be one of: ${Object.keys(entry).join(', ')}`);
  }
  return { template, body, catalog, values };
}
function resolve(text, catalog, values) {
  let out = text;
  for (let pass = 0; pass < 4 && /\{[a-z]+\}/.test(out); pass++) {
    out = out.replace(/\{([a-z]+)\}/g, (whole, key) => {
      if (!(key in values)) return whole;
      const entry = catalog[key], value = values[key];
      return entry && typeof entry === 'object' && value in entry ? entry[value] : String(value);
    });
  }
  const missing = out.match(/\{[a-z]+\}/g);
  if (missing) throw new Error(`Unresolved slots: ${[...new Set(missing)].join(', ')}`);
  return out.replace(/\s+/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
}
function compose(byId, id, overrides, baseId) {
  const { body, catalog, values } = composeParts(byId, id, overrides);
  if (body.includes('{base}')) {
    if (!baseId) throw new Error(`${id} needs --base PT-xxx`);
    const base = composeParts(byId, baseId, {});
    // Only the base location sentence survives; the overlay owns the subject.
    values.base = resolve(base.body, base.catalog, base.values).split(/(?<=\.)\s/)[0];
  }
  const prefix = byId.get('VR-001').blocks['prompt-prefix'], suffix = byId.get('VR-002').blocks['prompt-suffix'];
  const main = [prefix, resolve(body, catalog, values), suffix].join(' ');
  // The fallback swaps every anatomical monster line for its trace twin and drops the corpse.
  const traceCatalog = { ...catalog, monster: catalog.monster_trace };
  const fallbackValues = { ...values, corpse: 'none' };
  const fallbackBody = byId.get('PT-011').blocks.prompt.replace('{base}', resolve(body, traceCatalog, fallbackValues));
  const fallback = [prefix, resolve(fallbackBody, traceCatalog, fallbackValues), suffix].join(' ');
  if (fallback.includes('The creature:') || fallback.includes(resolve(catalog.creature, catalog, {}))) throw new Error(`${id} fallback still describes the creature's anatomy`);
  for (const [name, text] of [['main', main], ['fallback', fallback]]) {
    if (text.length > MAX_PROMPT) throw new Error(`${id} ${name} prompt is ${text.length} chars (limit ${MAX_PROMPT})`);
    if (/[\p{Script=Han}]/u.test(text)) throw new Error(`${id} ${name} prompt contains Chinese production text`);
  }
  return { template: id, base: baseId ?? null, slots: values, main, fallback, length: { main: main.length, fallback: fallback.length } };
}

function runBranch(args) {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--import', new URL('./window-locks-ts-loader.mjs', import.meta.url).href, path.join(root, 'tools/video-prompt-compose.ts'), ...args], {cwd:root, encoding:'utf8'});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Branch validation failed');
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'build') {
    runBranch(['--check']);
    const index = buildIndex();
    // Composition must succeed for every template before the index is accepted.
    const byId = new Map(sections().chunks.map(c => [c.id, c]));
    for (const id of byId.keys()) if (id.startsWith('PT-') && id !== 'PT-011') compose(byId, id, {}, id === 'PT-010' ? 'PT-003' : undefined);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
    const kinds = index.chunks.reduce((n, c) => (n[c.kind] = (n[c.kind] ?? 0) + 1, n), {});
    console.log(`Indexed ${index.chunks.length} sections (VR ${kinds.VR ?? 0} / VP ${kinds.VP ?? 0} / PT ${kinds.PT ?? 0}); ${Object.keys(index.snapshots).length} source fingerprints. Local retrieval only.`);
  } else if (command === 'check') {
    const index = loadFresh();
    if (JSON.stringify(index) !== JSON.stringify(buildIndex())) throw new Error('Index differs from current sources; review and rebuild.');
    const byId = new Map(sections().chunks.map(c => [c.id, c]));
    let composed = 0;
    for (const id of byId.keys()) if (id.startsWith('PT-') && id !== 'PT-011') { compose(byId, id, {}, id === 'PT-010' ? 'PT-003' : undefined); composed++; }
    console.log(`PASS: ${index.chunks.length} sections current; ${composed} templates compose within ${MAX_PROMPT} chars with no Chinese text.`);
    runBranch(['--check']);
  } else if (command === 'compose-branch') {
    loadFresh();
    runBranch(args);
  } else if (command === 'list') {
    for (const c of loadFresh().chunks) console.log(`${c.id}\t${c.status}\t${c.title.slice(c.id.length).trim()}`);
  } else if (command === 'query') {
    let top = 4, json = false, kind;
    const terms = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') json = true;
      else if (args[i] === '--top') top = Number(args[++i]);
      else if (args[i] === '--kind') kind = args[++i]?.toUpperCase();
      else if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
      else terms.push(args[i]);
    }
    if (!terms.length || !Number.isInteger(top) || top < 1 || top > 40) throw new Error('Supply a query and --top from 1 to 40.');
    if (kind && !['VR', 'VP', 'PT', 'AP', 'NS'].includes(kind)) throw new Error('--kind must be VR, VP, PT, AP or NS');
    const query = terms.join(' '), results = search(loadFresh(), query, top, kind);
    if (json) console.log(JSON.stringify({ query, mode: 'local-lexical-bm25', results }, null, 2));
    else if (!results.length) console.log('No matching section. Read docs/video-prompts/level-01-harbor-rescue.md; do not infer a missing shot.');
    else for (const r of results) console.log(`[${r.id}] ${r.title}\n状态：${r.status}\n来源：${r.source}:${r.line}\n${r.content}\n`);
  } else if (command === 'compose') {
    loadFresh();
    const id = args[0]?.toUpperCase();
    if (!id) throw new Error('Usage: compose PT-xxx [--set slot=value]... [--base PT-xxx] [--json]');
    const overrides = {};
    let baseId, json = false;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--set') { const [k, ...v] = (args[++i] ?? '').split('='); if (!k || !v.length) throw new Error('--set needs slot=value'); overrides[k] = v.join('='); }
      else if (args[i] === '--base') baseId = args[++i]?.toUpperCase();
      else if (args[i] === '--json') json = true;
      else throw new Error(`Unknown option: ${args[i]}`);
    }
    const byId = new Map(sections().chunks.map(c => [c.id, c]));
    const result = compose(byId, id, overrides, baseId);
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`[${result.template}${result.base ? ' on ' + result.base : ''}] main ${result.length.main} chars\n${result.main}\n\n[fallback] ${result.length.fallback} chars\n${result.fallback}`);
  } else {
    throw new Error('Usage: node tools/video-prompt-rag.mjs build | check | list | query "问题" [--top 4] [--kind VP] [--json] | compose PT-xxx [--set slot=value] [--base PT-xxx] [--json]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
