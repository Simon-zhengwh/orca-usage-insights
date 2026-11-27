// Use case: usage records -> one page of individual requests plus an hour-of-day rollup. Pure: no Node
// built-in or Orca imports. The panel asks for more pages as you scroll, so this sorts once per query and
// hands back a slice. `durationMs` is only known where the transcript recorded it (Pi, Antigravity), so a
// is reported for those requests and left out for the rest.

import { selectRecords } from './filters.mjs';
import { tableCosts } from './pricing.mjs';
import { dayKey, parseDateDay } from './query.mjs';
import { localClock } from './time.mjs';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
export const LOG_LIMIT_DEFAULT = 100;
export const LOG_LIMIT_MAX = 500;

// A page of `limit` rows from `offset`, newest first, over the same window and filters the report uses.
// `day` (YYYY-MM-DD) narrows to one local day. `hourly` is that day's 24 hours, or the whole window
// folded by hour of day, so the panel can draw a throughput chart either way.
export function buildRequestLog(records, { now = new Date(), providers, hosts, scope, catalog, day, offset = 0, limit = LOG_LIMIT_DEFAULT, ...query } = {}) {
  if (day !== undefined && day !== null) parseDateDay(day);
  const start = clamp(offset, 0, Number.MAX_SAFE_INTEGER);
  const size = clamp(limit, 1, LOG_LIMIT_MAX);
  const selected = selectRecords(records, { ...query, now, providers, hosts, scope });
  const { table, rows, days, count, startDay, endDay, hostNames, allModels } = selected;
  const { costs } = tableCosts(table, catalog);
  const toLocal = localClock();
  // With cache turned off the log counts only the tokens you were billed for; the columns stay raw.
  const withCache = query.includeCache !== false;
  const names = table.names;
  const nameOf = (id) => (id < 0 ? undefined : names[id]);
  const { ms, durationMs, input, output, cacheRead, cacheWrite, model, provider, project, cwd, host, sessionId } = table;
  const hourly = new Array(24);
  for (let h = 0; h < 24; h++) hourly[h] = { hour: h, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tokens: 0, uncached: 0, costUsd: 0, durationMs: 0, timed: 0 };
  const matched = [];
  let usd = 0;
  let tokens = 0;
  let uncached = 0;
  let outputTokens = 0;
  let inputTokens = 0;
  let readTokens = 0;
  let writeTokens = 0;
  let timed = 0;
  let timedOutput = 0;
  let measuredMs = 0;
  for (let k = 0; k < count; k++) {
    const i = rows[k];
    const dayOf = days[k];
    if (dayOf < startDay || dayOf > endDay) continue;
    if (day && dayKey(dayOf) !== day) continue;
    matched.push(i);
    const cost = costs[i];
    const all = input[i] + output[i] + cacheRead[i] + cacheWrite[i];
    const plain = input[i] + output[i];
    const counted = withCache ? all : plain;
    const duration = durationMs[i];
    const measured = Number.isFinite(duration) && duration > 0;
    usd += Number.isNaN(cost) ? 0 : cost;
    tokens += counted;
    uncached += plain;
    outputTokens += output[i];
    inputTokens += input[i];
    readTokens += cacheRead[i];
    writeTokens += cacheWrite[i];
    if (measured) {
      timed++;
      timedOutput += output[i];
      measuredMs += duration;
    }
    const hour = Math.floor((toLocal(ms[i]) - dayOf * DAY_MS) / HOUR_MS);
    if (hour < 0 || hour > 23) continue;
    const h = hourly[hour];
    h.requests++;
    h.input += input[i];
    h.output += output[i];
    h.cacheRead += cacheRead[i];
    h.cacheWrite += cacheWrite[i];
    h.tokens += counted;
    h.uncached += plain;
    h.costUsd += Number.isNaN(cost) ? 0 : cost;
    if (measured) {
      h.timed++;
      h.durationMs += duration;
    }
  }
  const ordered = matched.sort((a, b) => ms[b] - ms[a] || b - a);
  const page = ordered.slice(start, start + size);
  const out = [];
  for (const i of page) {
    const cost = costs[i];
    const duration = durationMs[i];
    const row = {
      ts: new Date(ms[i]).toISOString(),
      ms: ms[i],
      provider: nameOf(provider[i]),
      model: nameOf(model[i]),
      project: nameOf(project[i]),
      sessionId: nameOf(sessionId[i]),
      cwd: nameOf(cwd[i]),
      host: hostNames[host[i] + 1],
      input: input[i],
      output: output[i],
      cacheRead: cacheRead[i],
      cacheWrite: cacheWrite[i],
      usd: Number.isNaN(cost) ? null : cost,
    };
    if (Number.isFinite(duration) && duration > 0) {
      row.durationMs = duration;
      row.tokPerSec = round1(output[i] / (duration / 1000));
    }
    out.push(row);
  }
  const hourlyOut = hourly.map((h) => ({
    ...h,
    costUsd: round2(h.costUsd),
    durationMs: h.timed ? Math.round(h.durationMs) : 0,
    tokPerSec: h.timed ? round1(h.output / (h.durationMs / 1000)) : null,
  }));
  return {
    day: day ?? null,
    offset: start,
    limit: size,
    total: matched.length,
    // Every model in the window, so a caller can offer a model picker. selectRecords collects these
    // before the models query narrows the rows, so the list stays complete while one is selected.
    models: [...allModels].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    rows: out,
    hourly: hourlyOut,
    totals: {
      requests: matched.length,
      tokens,
      uncached,
      output: outputTokens,
      input: inputTokens,
      cacheRead: readTokens,
      cacheWrite: writeTokens,
      usd: round2(usd),
      timed,
      tokPerSec: timed && measuredMs ? round1(timedOutput / (measuredMs / 1000)) : null,
    },
  };
}

function clamp(value, low, high) {
  const n = Number(value);
  if (!Number.isFinite(n)) return low;
  return Math.min(high, Math.max(low, Math.floor(n)));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
