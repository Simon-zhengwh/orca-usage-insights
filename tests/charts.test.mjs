import test from 'node:test'
import assert from 'node:assert/strict'
import { dayTicks, areaTrend, segmentBar, smoothPath, stackedBars, hourBars, speedTrend, calendarHeatmap, punchCard, donut, hBars, sparkline, esc, levels } from '../src/panel/charts.mjs'
import { pixelBanner, paintScene, resample, skyFor } from '../src/panel/art.mjs'

const day = (d, v) => ({ day: d, input: v, output: v / 2, cacheRead: v * 4, cacheWrite: v / 4, total: v * 5.75, costUsd: 0 })
const wellFormed = (s) => {
  assert.match(s, /^<svg [^>]*>/)
  assert.ok(s.endsWith('</svg>'))
  assert.ok(!/NaN|undefined|Infinity/.test(s), 'no NaN/undefined in markup')
}

const hour = (h, tokens, tokPerSec = null) => ({ hour: h, requests: tokens ? 1 : 0, input: tokens / 2, output: tokens / 4, cacheRead: tokens / 4, cacheWrite: 0, tokens, uncached: tokens * 0.75, costUsd: 0, output_: 0, durationMs: 0, timed: tokPerSec == null ? 0 : 1, tokPerSec })

test('hourBars draws one mark per hour with hour labels and a throughput tooltip', () => {
  const hours = Array.from({ length: 24 }, (_, h) => hour(h, h === 9 ? 1000 : 0, h === 9 ? 42.5 : null))
  const s = hourBars(hours, { keys: ['input', 'output', 'cacheRead'] })
  wellFormed(s)
  assert.equal((s.match(/class="mark"/g) || []).length, 24)
  assert.match(s, />9时</)
  assert.match(s, />23时</)
  assert.match(JSON.stringify(s), /输出吞吐/)
  assert.match(JSON.stringify(s), /42\.5 Token\/秒/)
  assert.match(hourBars([]), /暂无用量/)
  assert.match(hourBars(hours.map((x) => ({ ...x, tokens: 0, input: 0, output: 0, cacheRead: 0 }))), /暂无用量/)
  // The cache-off keys never draw a cache segment.
  const dry = hourBars(hours, { keys: ['input', 'output'] })
  wellFormed(dry)
})

test('speedTrend skips hours without a measurement instead of drawing zeros', () => {
  const hours = Array.from({ length: 24 }, (_, h) => hour(h, h === 9 || h === 10 ? 1000 : 0, h === 9 ? 20 : h === 10 ? 60 : null))
  const s = speedTrend(hours)
  wellFormed(s)
  assert.equal((s.match(/spark-dot/g) || []).length, 2, 'one dot per measured hour')
  assert.match(s, /<polyline points="[^"]*"/, 'measured hours are joined')
  assert.match(s, /text-anchor="end">40</, 'the axis tops out at a round number')
  assert.match(speedTrend(hours.map((h) => ({ ...h, tokPerSec: null })), { width: 240 }), /暂无用量/)
  // A gap between measured hours breaks the line instead of bridging it.
  const split = speedTrend(hours.map((h) => ({ ...h, tokPerSec: h.hour === 9 ? 20 : h.hour === 12 ? 60 : null })))
  wellFormed(split)
  assert.equal((split.match('<polyline') || []).length, 0, 'no line across a gap')
})


test('esc escapes markup', () => {
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
})

test('stackedBars renders one mark per day with tooltips and handles empty', () => {
  const s = stackedBars([day('2026-10-28', 100), day('2026-10-29', 0), day('2026-10-30', 300)])
  wellFormed(s)
  assert.equal((s.match(/class="mark"/g) || []).length, 3)
  assert.match(s, /10月28日/)
  assert.match(stackedBars([]), /暂无用量/)
  assert.match(stackedBars([day('2026-10-28', 0)]), /暂无用量/)
})

test('calendarHeatmap places every day and uses quantile levels', () => {
  const cal = Array.from({ length: 182 }, (_, i) => ({ day: new Date(2026, 4, 5 + i).toLocaleDateString('en-CA'), total: i % 3 ? i : 0 }))
  const s = calendarHeatmap(cal)
  wellFormed(s)
  assert.equal((s.match(/class="mark cell/g) || []).length, 182)
  assert.deepEqual(levels([0, 1, 2, 3, 4]), [0, 1, 2, 3, 4])
  assert.deepEqual(levels([0, 0]), [0, 0])
})

test('punchCard draws 168 cells', () => {
  const grid = Array.from({ length: 168 }, (_, i) => i % 5)
  const s = punchCard(grid)
  wellFormed(s)
  assert.equal((s.match(/<circle/g) || []).length, 168)
  assert.match(punchCard([]), /暂无用量/)
})

test('donut skips zero segments and escapes labels', () => {
  const s = donut([{ label: '<b>', value: 3, color: 'red' }, { label: 'b', value: 0, color: 'blue' }, { label: 'c', value: 1, color: 'green' }])
  wellFormed(s)
  assert.equal((s.match(/class="mark"/g) || []).length, 2)
  assert.ok(!s.includes('<b>'))
  wellFormed(donut([]))
})

test('hBars truncates long labels and escapes', () => {
  const s = hBars([{ label: 'a-very-long-model-name-that-overflows', value: 10 }, { label: '<x>', value: 0 }])
  wellFormed(s)
  assert.match(s, /…/)
  assert.ok(!s.includes('<x>'))
})

test('sparkline handles short series', () => {
  wellFormed(sparkline([1]))
  wellFormed(sparkline([1, 4, 2]))
})

test('pixel banner is deterministic and follows the data', () => {
  const report = { generatedAt: new Date(2026, 10, 3, 22).toISOString(), range: '7d', daily: [1, 5, 2, 9, 3, 7, 4].map((v) => ({ total: v })), totals: { total: 100, output: 2, turns: 10 }, streak: { current: 3 }, today: { total: 4 }, peakDay: { total: 9 } }
  const a = pixelBanner(report)
  wellFormed(a)
  assert.equal(a, pixelBanner(report))
  const grid = paintScene(report)
  assert.equal(grid.length, 34)
  assert.equal(grid[0].length, 120)
  assert.ok(grid.every((row) => row.every((c) => /^#[0-9a-f]{6}$/.test(c))))
  wellFormed(pixelBanner({}))
  assert.deepEqual(resample([1, 2, 3, 4], 2), [3, 7])
  assert.equal(skyFor(12), 'day')
  assert.equal(skyFor(23), 'night')
})

test('areaTrend draws one smoothed line per provider with hover columns', () => {
  const mk = (p, vals) => ({ provider: p, daily: vals.map((v, i) => ({ day: `2026-10-2${i}`, total: v, costUsd: v / 10 })) })
  const s = areaTrend([mk('claude', [5, 9, 0, 3]), mk('codex', [1, 2, 8, 4])])
  wellFormed(s)
  assert.equal((s.match(/stroke-width="2"/g) || []).length, 2)
  assert.equal((s.match(/class="mark xhair"/g) || []).length, 4)
  wellFormed(areaTrend([mk('claude', [1])]))
  assert.match(areaTrend([mk('claude', [0, 0])]), /暂无用量/)
  assert.match(areaTrend([mk('claude', [5, 9])], { metric: 'costUsd', fmt: (v) => '$' + v }), /\$/)
})

test('smoothPath never dips below the lowest point (monotone)', () => {
  const pts = [[0, 100], [10, 100], [20, 0], [30, 100]]
  const ys = [...smoothPath(pts).matchAll(/-?\d+\.\d/g)].map((m) => Number(m[0]))
  assert.ok(Math.max(...ys) <= 100.05)
})

test('segmentBar gives tiny segments a visible minimum width and skips zeros', () => {
  const s = segmentBar([{ label: 'a', value: 1, color: 'red' }, { label: 'b', value: 0, color: 'x' }, { label: 'c', value: 1e6, color: 'blue' }])
  wellFormed(s)
  assert.equal((s.match(/class="mark"/g) || []).length, 2)
  assert.match(s, /width="4\.0"/)
  wellFormed(segmentBar([]))
})

test('dayTicks labels every day when there is room and always keeps the latest', () => {
  assert.deepEqual(dayTicks(7, 120), [0, 1, 2, 3, 4, 5, 6])
  assert.deepEqual(dayTicks(30, 10), [4, 9, 14, 19, 24, 29])
  assert.deepEqual(dayTicks(1, 300), [0])
})

test('stackedBars labels each of 7 days with its weekday', () => {
  const days = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']
  const s = stackedBars(days.map((d, i) => day(d, i + 1)), { width: 900 })
  for (const d of ['10月28日', '10月29日', '10月30日', '10月31日', '11月1日', '11月2日', '11月3日']) assert.ok(s.includes(`>${d}<`), d)
  assert.match(s, />周二</)
})
