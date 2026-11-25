import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestLog } from '../src/core/request-log.mjs';

// Fixed "now" is local 2026-11-03 15:30, so every assertion holds in any time zone.
const NOW = new Date(2026, 10, 3, 15, 30);
const at = (day, hour, minute = 0) => new Date(2026, 10, 3 - day, hour, minute).toISOString();
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (day) => {
  const d = new Date(2026, 10, 3 - day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function rec(day, hour, over = {}) {
  return {
    provider: 'pi', ts: at(day, hour), model: 'deepseek-v4.1-flash', project: 'alpha', sessionId: 's1',
    input: 10, output: 40, cacheRead: 0, cacheWrite: 0, ...over,
  };
}
const log = (records, extra = {}) => buildRequestLog(records, { range: '7d', now: NOW, ...extra });

test('rows come newest first and paging slices them without changing the total', () => {
  const records = [rec(0, 9), rec(2, 10), rec(0, 14, { output: 80 })];
  const first = log(records, { limit: 2 });
  assert.equal(first.total, 3);
  assert.deepEqual(first.rows.map((r) => r.ts), [at(0, 14), at(0, 9)]);
  const second = log(records, { limit: 2, offset: 2 });
  assert.deepEqual(second.rows.map((r) => r.ts), [at(2, 10)]);
  assert.equal(second.offset, 2);
  const past = log(records, { offset: 99 });
  assert.deepEqual(past.rows, []);
  // Out-of-range paging input is clamped instead of rejected.
  assert.equal(log(records, { limit: 0 }).limit, 1);
  assert.equal(log(records, { limit: 9_999 }).limit, 500);
});

test('a throughput is reported only where the transcript measured the request', () => {
  const records = [
    rec(0, 9, { durationMs: 500, output: 40 }), // 80 tok/s
    rec(0, 10, { durationMs: 2_000, output: 40 }), // 20 tok/s
    rec(0, 11), // no duration: tokens count, speed unknown
  ];
  const view = log(records);
  const [unknown, slow, fast] = view.rows;
  assert.equal(fast.tokPerSec, 80);
  assert.equal(slow.tokPerSec, 20);
  assert.equal(unknown.tokPerSec, undefined);
  assert.equal(unknown.durationMs, undefined);
  // The total throughput averages only the measured requests, so 80 outputs in 2.5 s.
  assert.equal(view.totals.tokPerSec, 32);
  assert.equal(view.totals.timed, 2);
  assert.equal(view.totals.requests, 3);
});

test('no measured request means no total throughput rather than a zero', () => {
  const view = log([rec(0, 9), rec(1, 8)]);
  assert.equal(view.totals.tokPerSec, null);
  assert.equal(view.totals.timed, 0);
});

test('totals carry each token kind, so the hour legend and the strip can label them', () => {
  const view = log([
    rec(0, 9, { input: 10, output: 40, cacheRead: 100, cacheWrite: 5 }),
    rec(0, 10, { input: 20, output: 60, cacheRead: 200, cacheWrite: 0 }),
  ]);
  assert.equal(view.totals.input, 30);
  assert.equal(view.totals.output, 100);
  assert.equal(view.totals.cacheRead, 300);
  assert.equal(view.totals.cacheWrite, 5);
  assert.equal(view.totals.requests, 2);
  // Cache off drops the token total but keeps the raw counts that the columns show.
  const dry = log([rec(0, 9, { input: 10, output: 40, cacheRead: 100, cacheWrite: 5 })], { includeCache: false });
  assert.equal(dry.totals.tokens, 50);
  assert.equal(dry.totals.cacheRead, 100);
});

test('hourly rolls tokens, cost and throughput into 24 local hours', () => {
  const records = [
    rec(0, 9, { durationMs: 1_000, output: 50, input: 10 }),
    rec(0, 9, { durationMs: 1_000, output: 50, input: 10 }),
    rec(1, 20, { durationMs: 500, output: 10, input: 0, cacheRead: 30 }),
  ];
  const view = log(records, { includeCache: false });
  assert.equal(view.hourly.length, 24);
  const nine = view.hourly[9];
  assert.equal(nine.hour, 9);
  assert.equal(nine.requests, 2);
  // Two 10-in/50-out requests, cache off in the query so cacheRead stays out of the totals.
  assert.equal(nine.tokens, 120);
  assert.equal(nine.uncached, 120);
  assert.equal(nine.output, 100);
  assert.equal(nine.tokPerSec, 50);
  const evening = view.hourly[20];
  assert.equal(evening.tokens, 10);
  assert.equal(evening.tokPerSec, 20);
  assert.equal(view.hourly[7].tokPerSec, null);
  assert.equal(view.hourly[7].requests, 0);
});

test('a day narrows the log and the hourly chart to that local day', () => {
  const records = [rec(0, 9), rec(0, 14), rec(1, 8)];
  const today = log(records, { day: dayOf(0) });
  assert.equal(today.total, 2);
  assert.deepEqual(today.rows.map((r) => r.ts), [at(0, 14), at(0, 9)]);
  assert.equal(today.hourly[8].requests, 0);
  assert.equal(today.hourly[14].requests, 1);
  assert.equal(today.day, dayOf(0));
  const older = log(records, { day: dayOf(1) });
  assert.equal(older.total, 1);
  assert.equal(older.hourly[8].requests, 1);
  assert.equal(older.hourly[9].requests, 0);
});

test('a malformed day is rejected instead of silently ignored', () => {
  assert.throws(() => log([rec(0, 9)], { day: '2026-11-31' }), /real calendar date/);
  assert.throws(() => log([rec(0, 9)], { day: 'yesterday' }), /YYYY-MM-DD/);
});

test('rows carry host, project and cache columns, and an unpriced turn has no cost', () => {
  const view = log([
    rec(0, 9, { host: 'ssh:box', project: 'beta', cacheRead: 500, cacheWrite: 7, model: 'unknown-gateway' }),
  ]);
  const [row] = view.rows;
  assert.equal(row.host, 'ssh:box');
  assert.equal(row.project, 'beta');
  assert.equal(row.cacheRead, 500);
  assert.equal(row.cacheWrite, 7);
  assert.equal(row.usd, null);
  assert.equal(view.totals.usd, 0);
});

test('the window and the provider filter apply before paging', () => {
  const records = [rec(0, 9), rec(1, 9, { provider: 'claude' }), rec(20, 9)];
  assert.equal(log(records, { range: '1d' }).total, 1);
  assert.equal(log(records, { providers: ['claude'] }).total, 1);
  assert.equal(log(records, { providers: ['pi'] }).total, 1);
});
