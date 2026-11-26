// Antigravity's transcript has no cwd: the workspace of a conversation lives in its index database
// next to brain/. This reads that index (one small table) so a session gets the project the panel
// groups by. Read-only and lazy: `node:sqlite` is imported only when an index is actually found, and
// a missing, locked or unreadable index just leaves the cwd out.
import { pathFor } from './paths.mjs';

const INDEX_FILE = 'conversation_summaries.db';

// Map of conversation id -> cwd from every root's index. `roots` are the Antigravity roots (the
// directories that hold brain/), so a root that has no index simply contributes nothing.
export async function readAgyCwds({ fs, roots, platform = process.platform } = {}) {
  const p = pathFor(platform);
  const cwds = new Map();
  const indexes = roots.map((root) => p.join(root, INDEX_FILE));
  const found = [];
  for (const path of indexes) {
    try {
      if ((await fs.stat(path)).isFile()) found.push(path);
    } catch {
      // No index next to this root: nothing to read.
    }
  }
  if (found.length === 0) return cwds;
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return cwds; // An older Node keeps the rest of the plugin working, without cwds.
  }
  for (const path of found) {
    let db;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 1000');
      const rows = db.prepare('SELECT conversation_id, workspace_uris FROM conversation_summaries').all();
      for (const row of rows) {
        const cwd = firstWorkspace(row.workspace_uris);
        const id = typeof row.conversation_id === 'string' ? row.conversation_id : '';
        if (cwd && id && !cwds.has(id)) cwds.set(id, cwd);
      }
    } catch {
      // A locked or half-written index is an index we cannot read, not a scan failure.
    } finally {
      try {
        db?.close();
      } catch {}
    }
  }
  return cwds;
}

// `["file:///D:/x/y"]` -> `D:/x/y`. The first workspace wins, and a percent-encoded drive
// (`file:///c%3A/...`) decodes to the same shape.
export function firstWorkspace(value) {
  let list;
  try {
    list = JSON.parse(value);
  } catch {
    return '';
  }
  if (!Array.isArray(list)) return '';
  for (const entry of list) {
    if (typeof entry === 'string' && entry.startsWith('file://')) return fileUrlToPath(entry);
  }
  return '';
}

function fileUrlToPath(url) {
  const rest = url.slice('file://'.length);
  let decoded;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    decoded = rest;
  }
  // A Windows path arrives as `/c%3A/x` or `/C:/x`; the leading slash is the URL's, not the path's.
  return decoded.replace(/^\/(?=[A-Za-z]:)/, '');
}
