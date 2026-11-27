import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgyNative, field, generationMillis, generationOf, nativeDbPath } from '../src/node/agy-native.mjs';

// Minimal protobuf encoders, so a fixture is built the way Antigravity writes one.
function varint(value) {
  const out = [];
  let v = value;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
}

const bytes = (number, value) => Buffer.concat([varint(number * 8 + 2), varint(value.length), Buffer.from(value)]);
const number = (fieldNumber, value) => Buffer.concat([varint(fieldNumber * 8), varint(value)]);
const duration = (ms) => Buffer.concat([number(1, Math.floor(ms / 1000)), number(2, (ms % 1000) * 1e6)]);

const stepMetadata = (generation) =>
  bytes(20, generation === 0 ? Buffer.alloc(0) : number(3, generation));
const generationRow = (firstTokenMs, streamMs) => bytes(1, Buffer.concat([bytes(11, duration(firstTokenMs)), bytes(12, duration(streamMs))]));

test('nativeDbPath finds conversations/<id>.db next to a brain tree, and nothing for another shape', () => {
  assert.equal(
    nativeDbPath('C:\\Users\\me\\.gemini\\antigravity-cli\\brain\\sess-a\\.system_generated\\logs\\transcript.jsonl', 'win32'),
    'C:\\Users\\me\\.gemini\\antigravity-cli\\conversations\\sess-a.db',
  );
  assert.equal(
    nativeDbPath('/home/me/.gemini/antigravity/brain/sess-b/.system_generated/logs/transcript.jsonl', 'linux'),
    '/home/me/.gemini/antigravity/conversations/sess-b.db',
  );
  assert.equal(nativeDbPath('/elsewhere/transcript.jsonl', 'linux'), null);
  assert.equal(nativeDbPath('/home/me/other/sess/.system_generated/logs/transcript.jsonl', 'linux'), null);
});

test('generationOf reads the index from step metadata and treats a missing one as generation zero', () => {
  assert.equal(generationOf(stepMetadata(3)), 3);
  assert.equal(generationOf(stepMetadata(0)), 0);
  assert.equal(generationOf(Buffer.concat([number(3, 2)])), null, 'no generation reference at all');
  assert.equal(generationOf(undefined), null);
});

test('generationMillis sums the first-token wait and the stream, and refuses a generation with no timing', () => {
  assert.equal(generationMillis(generationRow(5223, 8793)), 14016);
  assert.equal(generationMillis(bytes(1, bytes(19, Buffer.from('gemini-4-neon')))), null, 'a model name is not a timing');
  assert.equal(generationMillis(bytes(1, Buffer.concat([number(11, 0)]))), null, 'a zero duration is not a measurement');
  assert.equal(generationMillis(bytes(1, Buffer.concat([bytes(11, duration(1200)), bytes(12, duration(0))]))), 1200);
  assert.equal(generationMillis(null), null);
});

test('field walks a message and stops on an unexpected wire type', () => {
  const message = Buffer.concat([number(7, 42), bytes(9, Buffer.from('abc'))]);
  assert.deepEqual(field(message, 7), { wire: 0, value: 42 });
  assert.equal(field(message, 9).value.toString(), 'abc');
  assert.equal(field(message, 8), null);
});

test('durationsFor maps a step to its duration and re-reads only when the database changes', async (t) => {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'usage-agy-native-')));
  t.after(() => fsp.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'antigravity-cli');
  const logs = path.join(root, 'brain', 'sess-a', '.system_generated', 'logs');
  await fsp.mkdir(logs, { recursive: true });
  const transcript = path.join(logs, 'transcript.jsonl');
  await fsp.writeFile(transcript, '');
  const dbPath = path.join(root, 'conversations', 'sess-a.db');
  await writeDb(dbPath, [
    [1, stepMetadata(0)],
    [5, stepMetadata(1)],
    [10, stepMetadata(2)],
  ], [
    [0, generationRow(5223, 8793)],
    [1, generationRow(1000, 500)],
  ]);

  let stats = 0;
  const fs = { ...fsp, stat: (...args) => (stats++, fsp.stat(...args)) };
  const native = createAgyNative({ fs });
  const first = await native.durationsFor(transcript);
  assert.deepEqual(first.pairs, [[1, 14016], [5, 1500]], 'step 10 has no generation row, so it stays unmeasured');
  assert.equal(typeof first.key, 'string');

  const again = await native.durationsFor(transcript);
  assert.equal(again, first, 'an unchanged database is not opened again');

  // A generation finishing later moves the database: the new state is read and its timing appears.
  await fsp.writeFile(dbPath, await rebuilt(dbPath, [
    [1, stepMetadata(0)],
    [5, stepMetadata(1)],
    [10, stepMetadata(2)],
  ], [
    [0, generationRow(5223, 8793)],
    [1, generationRow(1000, 500)],
    [2, generationRow(2000, 1000)],
  ]));
  const moved = await native.durationsFor(transcript);
  assert.notEqual(moved, first);
  assert.deepEqual(moved.pairs, [[1, 14016], [5, 1500], [10, 3000]]);
});

test('durationsFor treats a missing or unreadable database as no measurements', async (t) => {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'usage-agy-native-')));
  t.after(() => fsp.rm(base, { recursive: true, force: true }));
  const logs = path.join(base, 'antigravity-cli', 'brain', 'sess-a', '.system_generated', 'logs');
  await fsp.mkdir(logs, { recursive: true });
  const transcript = path.join(logs, 'transcript.jsonl');
  await fsp.writeFile(transcript, '');
  const native = createAgyNative({ fs: fsp });
  assert.deepEqual(await native.durationsFor(transcript), { key: null, pairs: [] });

  // Something that is not a SQLite database at all must not fail the scan.
  await fsp.mkdir(path.join(base, 'antigravity-cli', 'conversations'), { recursive: true });
  await fsp.writeFile(path.join(base, 'antigravity-cli', 'conversations', 'sess-a.db'), 'not a database');
  assert.deepEqual((await native.durationsFor(transcript)).pairs, []);
});

async function rebuilt(file, steps, generations) {
  const copy = `${file}.next`;
  await writeDb(copy, steps, generations);
  const body = await fsp.readFile(copy);
  await fsp.unlink(copy);
  return body;
}

async function writeDb(file, steps, generations) {
  const { DatabaseSync } = await import('node:sqlite');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.rm(file, { force: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE steps (idx INTEGER, step_type INTEGER, metadata BLOB)');
  db.exec('CREATE TABLE gen_metadata (idx INTEGER, data BLOB)');
  const step = db.prepare('INSERT INTO steps VALUES (?, 15, ?)');
  for (const [idx, metadata] of steps) step.run(idx, metadata);
  const gen = db.prepare('INSERT INTO gen_metadata VALUES (?, ?)');
  for (const [idx, data] of generations) gen.run(idx, data);
  db.close();
}
