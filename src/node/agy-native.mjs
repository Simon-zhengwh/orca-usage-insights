// How long each Antigravity call took. The transcript holds only second-resolution step timestamps,
// but the CLI writes the exact timings next to it: `conversations/<id>.db` keeps, per generation, a
// first-token wait and a stream duration (two protobuf Duration messages). This reads them so a
// response can show its throughput, and leaves a call without a recorded generation unmeasured.
// Read-only and lazy: `node:sqlite` is imported only when a database is actually found.
import { pathFor } from './paths.mjs';

const STEPS_SQL = 'SELECT idx, metadata FROM steps WHERE step_type = 15';
const GENERATIONS_SQL = 'SELECT idx, data FROM gen_metadata';

// `<root>/brain/<session>/.system_generated/logs/transcript.jsonl` -> `<root>/conversations/<session>.db`
export function nativeDbPath(transcriptPath, platform = process.platform) {
  const p = pathFor(platform);
  const logs = p.dirname(transcriptPath); // .../logs
  const generated = p.dirname(logs); // .../.system_generated
  const session = p.dirname(generated); // .../<session id>
  const brain = p.dirname(session);
  if (p.basename(brain).toLowerCase() !== 'brain') return null;
  const root = p.dirname(brain);
  return p.join(root, 'conversations', `${p.basename(session)}.db`);
}

// Timings for one conversation. `key` is the database's fingerprint (with its WAL), so a caller can
// tell whether it has already read this state; `pairs` are [stepIndex, durationMs] as plain JSON-safe
// values, because a parser's context is cached and passed to a parse thread.
export function createAgyNative({ fs, platform = process.platform } = {}) {
  const memo = new Map(); // db path -> { key, pairs }

  return { durationsFor };

  // `{ key, pairs }`. A missing database, an unreadable one, an older Node or a conversation with no
  // recorded generation all come back as no pairs, never as an error: the transcript still counts.
  async function durationsFor(transcriptPath) {
    const dbPath = nativeDbPath(transcriptPath, platform);
    if (!dbPath) return { key: null, pairs: [] };
    const key = await fingerprint(fs, dbPath);
    if (key === null) return { key: null, pairs: [] };
    const hit = memo.get(dbPath);
    if (hit && hit.key === key) return hit;
    const pairs = await readDurations(dbPath).catch(() => []);
    const entry = { key, pairs };
    memo.set(dbPath, entry);
    return entry;
  }
}

// 'db mtime:size|wal mtime:size', or null when the database is missing.
async function fingerprint(fs, dbPath) {
  const parts = [];
  for (const suffix of ['', '-wal']) {
    try {
      const st = await fs.stat(dbPath + suffix);
      parts.push(`${st.mtimeMs}:${st.size}`);
    } catch (error) {
      if (suffix === '' || error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
        if (suffix === '') return null;
        parts.push('');
      } else {
        return null;
      }
    }
  }
  return parts.join('|');
}

async function readDurations(dbPath) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return [];
  }
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 1000');
    const generations = new Map();
    for (const row of db.prepare(GENERATIONS_SQL).all()) {
      const ms = generationMillis(row.data);
      if (ms !== null) generations.set(Number(row.idx), ms);
    }
    const pairs = [];
    for (const row of db.prepare(STEPS_SQL).all()) {
      const generation = generationOf(row.metadata);
      if (generation === null) continue;
      const ms = generations.get(generation);
      if (ms === undefined) continue;
      pairs.push([Number(row.idx), ms]);
    }
    return pairs.sort((a, b) => a[0] - b[0]);
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

// steps.metadata field 20 -> { field 3: the generation index }. Protobuf leaves a zero index out, so
// a message without field 3 is generation 0.
export function generationOf(metadata) {
  const bytes = toBuffer(metadata);
  if (!bytes) return null;
  const reference = field(bytes, 20);
  if (!reference || reference.wire !== 2) return null;
  const index = field(reference.value, 3);
  if (index === null) return 0;
  return index.wire === 0 ? index.value : null;
}

// gen_metadata.data field 1 -> response { field 11: first token, field 12: stream }. The call took
// both, so their sum is the duration the throughput is measured over.
export function generationMillis(data) {
  const bytes = toBuffer(data);
  if (!bytes) return null;
  const response = field(bytes, 1);
  if (!response || response.wire !== 2) return null;
  const first = field(response.value, 11);
  const stream = field(response.value, 12);
  if (!first || first.wire !== 2 || !stream || stream.wire !== 2) return null;
  const firstMs = durationMillis(first.value);
  const streamMs = durationMillis(stream.value);
  if (firstMs === null || streamMs === null) return null;
  const total = firstMs + streamMs;
  return total > 0 ? total : null;
}

// google.protobuf.Duration: field 1 seconds, field 2 nanos.
function durationMillis(bytes) {
  const seconds = field(bytes, 1);
  const nanos = field(bytes, 2);
  const s = seconds === null ? 0 : seconds.wire === 0 ? seconds.value : null;
  const n = nanos === null ? 0 : nanos.wire === 0 ? nanos.value : null;
  if (s === null || n === null) return null;
  const ms = s * 1000 + Math.floor(n / 1e6);
  return ms >= 0 ? ms : null;
}

// First occurrence of a field in one protobuf message: { wire, value } for a varint (0) or a
// length-delimited value (2), or null. Anything else ends the scan: this only reads what it names.
export function field(bytes, wanted) {
  let at = 0;
  while (at < bytes.length) {
    const key = varint(bytes, at);
    if (key === null) return null;
    at = key.next;
    const number = Math.floor(key.value / 8);
    const wire = key.value % 8;
    if (wire === 0) {
      const value = varint(bytes, at);
      if (value === null) return null;
      at = value.next;
      if (number === wanted) return { wire, value: value.value };
    } else if (wire === 2) {
      const length = varint(bytes, at);
      if (length === null) return null;
      const start = length.next;
      const end = start + length.value;
      if (end > bytes.length) return null;
      at = end;
      if (number === wanted) return { wire, value: bytes.subarray(start, end) };
    } else if (wire === 5) {
      at += 4;
    } else if (wire === 1) {
      at += 8;
    } else {
      return null;
    }
  }
  return null;
}

function varint(bytes, at) {
  let value = 0;
  let shift = 0;
  let i = at;
  while (i < bytes.length) {
    const byte = bytes[i];
    i += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: i };
    shift += 7;
    if (shift > 49) return null;
  }
  return null;
}

function toBuffer(value) {
  if (value instanceof Uint8Array) return value;
  return null;
}
