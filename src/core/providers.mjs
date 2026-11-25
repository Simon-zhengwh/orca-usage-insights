// Per-provider wiring for transcript providers: transcript roots, line markers and parser factory. The
// scanner, its parse threads and the byte-level line filter all read it, so a transcript provider is
// added in one place. Providers that keep usage in a database instead (OpenCode) are not listed here:
// they are a source of their own (src/node/opencode-source.mjs). Display names for every provider live
// in provider-names.mjs. Pi is read like Claude and Codex: its sessions are JSONL transcripts.
import { CLAUDE_MARKERS, CODEX_MARKERS, PI_MARKERS, createClaudeParser, createCodexParser, createPiParser } from './records.mjs';

export const PROVIDERS = {
  claude: { markers: CLAUDE_MARKERS, subdirs: ['projects'], createParser: createClaudeParser },
  // Codex event types sit in a line's first ~100 bytes, so only the head is searched and tool output is skipped.
  codex: { markers: CODEX_MARKERS, markerHead: 256, subdirs: ['sessions', 'archived_sessions'], createParser: createCodexParser },
  // Pi keeps one file per session under sessions/<project>/; the project slug is one level down, so the walk finds it.
  pi: { markers: PI_MARKERS, subdirs: ['sessions'], createParser: createPiParser },
};

// A line can only produce a record (or parser state) when it contains one of these. The scanner
// uses them to skip every other line without decoding it.
export const LINE_MARKERS = Object.fromEntries(Object.entries(PROVIDERS).map(([kind, provider]) => [kind, provider.markers]));

export const MARKER_HEADS = Object.fromEntries(
  Object.values(PROVIDERS).flatMap((provider) => (provider.markerHead ? provider.markers.map((marker) => [marker, provider.markerHead]) : [])),
);
