import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { firstWorkspace, readAgyCwds } from '../src/node/agy-index.mjs';

test('firstWorkspace reads the first file URL, decoding a drive that arrives percent-encoded', () => {
  assert.equal(firstWorkspace(JSON.stringify(['file:///D:/java/DRI/social-media'])), 'D:/java/DRI/social-media');
  assert.equal(firstWorkspace(JSON.stringify(['file:///c%3A/Users/me/seo'])), 'c:/Users/me/seo');
  assert.equal(firstWorkspace(JSON.stringify(['https://example.com/x', 'file:///home/me/work'])), '/home/me/work');
  assert.equal(firstWorkspace(JSON.stringify([])), '');
  assert.equal(firstWorkspace('not json'), '');
  assert.equal(firstWorkspace(null), '');
});

test('readAgyCwds maps a conversation to its cwd and survives a missing or foreign root', async (t) => {
  const base = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'usage-agy-index-')));
  t.after(() => fsp.rm(base, { recursive: true, force: true }));
  const withIndex = path.join(base, 'antigravity-cli');
  const without = path.join(base, 'antigravity-acp');
  await fsp.mkdir(without, { recursive: true });
  await makeIndex(path.join(withIndex, 'conversation_summaries.db'), [
    ['sess-a', JSON.stringify(['file:///D:/work/proj-a'])],
    ['sess-b', 'not json'],
  ]);
  const cwds = await readAgyCwds({ fs: fsp, roots: [without, withIndex] });
  assert.deepEqual([...cwds], [['sess-a', 'D:/work/proj-a']]);

  const empty = await readAgyCwds({ fs: fsp, roots: [without] });
  assert.equal(empty.size, 0);
});

async function makeIndex(file, rows) {
  const { DatabaseSync } = await import('node:sqlite');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE conversation_summaries (conversation_id TEXT, workspace_uris TEXT)');
  const insert = db.prepare('INSERT INTO conversation_summaries VALUES (?, ?)');
  for (const [id, uris] of rows) insert.run(id, uris);
  db.close();
}
