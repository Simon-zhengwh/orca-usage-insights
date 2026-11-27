import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = fileURLToPath(new URL('../', import.meta.url))

function sampleReport(range = '7d', includeCache = true) {
  const daily = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${String(28 + i).padStart(2, '0')}`.replace('2026-10-32', '2026-11-01').replace('2026-10-33', '2026-11-02').replace('2026-10-34', '2026-11-03'), input: 1000 * i, output: 500 * i, cacheRead: 9000 * i, cacheWrite: 300 * i, total: 10800 * i, costUsd: i }))
  const report = {
    includeCache, startDate: '2026-10-28', endDate: '2026-11-03', models: ['claude-opus-5-5', 'gpt-5-codex'],
    byDayModel: [
      { day: '2026-11-03', provider: 'codex', model: 'gpt-5-codex', input: 10000, output: 2000, cacheRead: 500, cacheWrite: 80, total: includeCache ? 12580 : 12000 },
      { day: '2026-11-02', provider: 'claude', model: 'claude-opus-5-5', input: 1234567, output: 4000, cacheRead: 20000, cacheWrite: 90, total: includeCache ? 1258657 : 1238567 },
    ],
    generatedAt: '2026-11-03T20:23:29.000Z', range, providers: ['claude', 'codex'],
    totals: { input: 21000, output: 10500, cacheRead: 189000, cacheWrite: 6300, total: 226800, costUsd: 21, hasUnpriced: true, sessions: 3, turns: 42, cacheReuseRate: 0.9 },
    today: { total: 64800, costUsd: 6 },
    daily,
    calendar: Array.from({ length: 182 }, (_, i) => ({ day: new Date(2026, 4, 5 + i).toLocaleDateString('en-CA'), total: i % 4 ? i * 10 : 0 })),
    punchCard: Array.from({ length: 168 }, (_, i) => i % 7),
    byModel: [{ model: 'claude-opus-5-5', total: 200000, costUsd: 20, share: 0.88 }, { model: 'gpt-5-codex', total: 26800, costUsd: null, share: 0.12 }],
    byProject: [{ project: 'pyrosome', total: 226800, share: 1 }],
    byProvider: [{ provider: 'claude', total: 200000, costUsd: 20, share: 0.88 }, { provider: 'codex', total: 26800, costUsd: null, share: 0.12 }],
    streak: { current: 6, longest: 9 },
    hosts: ['local', 'ssh:devbox'],
    byHost: [{ host: 'local', total: 200000, costUsd: 20, share: 0.88, sessions: 2, turns: 30 }, { host: 'ssh:devbox', total: 26800, costUsd: 1, share: 0.12, sessions: 1, turns: 12 }],
    sources: [
      { id: 'local', kind: 'local', label: 'This machine', state: 'ok', files: 10, records: 30, lastScanAt: new Date().toISOString(), ms: 40 },
      { id: 'ssh:devbox', kind: 'ssh', label: 'devbox', state: 'error', files: 3, records: 12, lastScanAt: null, ms: 900, message: 'SSH login was refused.' },
    ],
    peakDay: { day: '2026-11-03', total: 64800 },
  }
  if (!includeCache) {
    report.totals.total = report.totals.input + report.totals.output
    for (const day of report.daily) day.total = day.input + day.output
    report.today.total = 9000
    report.peakDay.total = 9000
  }
  return report
}

function fakeDom() {
  const els = new Map()
  const make = (id) => ({
    id, innerHTML: '', textContent: '', value: '', focus() {}, hidden: false, checked: true, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, getAttribute(k) { return this.attrs[k] },
    listeners: {}, addEventListener(t, f) { this.listeners[t] = f },
    querySelector() { return null }, querySelectorAll() { return [] }, getBoundingClientRect: () => ({ width: 100, height: 40 }),
  })
  return {
    els,
    document: { getElementById: (id) => (els.has(id) ? els.get(id) : (els.set(id, make(id)), els.get(id))), addEventListener() {} },
  }
}

test('built panel is a single classic script with no module syntax', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root })
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(scripts.length, 1)
  assert.ok(!/^\s*(import|export) /m.test(scripts[0]))
  assert.ok(!/<script src|<link /.test(html), 'no external resources')
  assert.match(html, /connect-src 'none'/)
})

test('panel requests a report and renders every section', async () => {
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  const { els, document } = fakeDom()
  const calls = []
  const orca = {
    plugin: { request: async (name, input) => { calls.push([name, input]); return sampleReport(input.range, input.includeCache) }, on() {} },
    on() {},
  }
  const ctx = vm.createContext({ document, orca, window: { innerWidth: 800, innerHeight: 600 }, console, Date, Intl, JSON, Math })
  vm.runInContext(script, ctx)
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(JSON.stringify(calls.find(([name]) => name === 'usage.report')), JSON.stringify(['usage.report', { range: '7d', includeCache: true }]))
  const get = (id) => els.get(id)
  assert.match(get('tiles').innerHTML, /226\.8k/)
  assert.match(get('tiles').innerHTML, /缓存命中率/)
  assert.match(get('tiles').innerHTML, /复用/)
  assert.match(get('tiles').innerHTML, /\$21\.00\+/)
  assert.match(get('daily').innerHTML, /<svg/)
  assert.match(get('calendar').innerHTML, /cell q4/)
  assert.match(get('punch').innerHTML, /<circle/)
  assert.match(get('donut').innerHTML, /stroke-dasharray/)
  assert.match(get('breakdown').innerHTML, /claude-opus-5-5/)
  assert.match(get('breakdown').innerHTML, /share-line/)
  assert.match(get('trend').innerHTML, /<path d="M/)
  assert.match(get('typebar').innerHTML, /<svg/)
  assert.match(get('totals').innerHTML, /缓存节省/)
  assert.match(get('ov-providers').innerHTML, /Claude Code/)
  assert.match(get('banner').innerHTML, /crispEdges/)
  assert.match(get('providers').innerHTML, /Codex/)
  assert.equal(get('content').hidden, false)
  assert.match(get('hosts').innerHTML, /devbox/)
  assert.equal(get('sec-hosts').hidden, false)
  assert.equal(get('sec-providers').hidden, false)
  assert.equal(get('chips').innerHTML, '', 'no chips while every filter is at its default')
  assert.equal(get('filters-count').hidden, true)
  assert.match(get('hosts').innerHTML, /本机/)
  assert.match(get('sources').innerHTML, /src error/)
  assert.match(get('notice').textContent, /SSH login was refused/)
  assert.equal(get('ov-hosts').hidden, false)
  assert.match(html, /data-range="7d" aria-checked="true">7 天/)
  assert.match(html, /data-range="1d" aria-checked="false" tabindex="-1">今天/)
  get('ranges').listeners.click({ target: { closest: () => ({ dataset: { range: '1d', includeCache: true } }) } })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['usage.report', { range: '1d', includeCache: true }]))
  get('ranges').listeners.click({ target: { closest: () => ({ dataset: { range: '7d', includeCache: true } }) } })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['usage.report', { range: '7d', includeCache: true }]))
})


test('the log view asks for a page of requests and renders a table, hours and throughput', async () => {
  const { calls, get, click, settle } = await mountPanel()
  click('view', { view: 'log' })
  await settle()
  assert.deepEqual(calls.at(-1), { name: 'usage.log', input: { range: '7d', includeCache: true, offset: 0, limit: 100 } })
  assert.equal(get('content').hidden, true, 'the usage cards are hidden while the log is open')
  assert.equal(get('log').hidden, false)
  assert.equal(get('bd').hidden, true)
  assert.match(get('log-hour').innerHTML, /<svg/)
  assert.match(get('log-hour-legend').innerHTML, /缓存读取/)
  assert.match(get('log-speed').innerHTML, /<circle/)
  assert.match(get('log-table').innerHTML, /deepseek-v4\.1-flash/)
  assert.match(get('log-table').innerHTML, /claude-opus-5-5/)
  assert.match(get('log-table').innerHTML, /20:05:00|20:05/, 'rows show a local clock time')
  assert.match(get('log-count').textContent, /12/)
  assert.match(get('log-sub').textContent, /12 \/ 12 笔/)
  assert.match(get('log-hour-title').textContent, /每小时用量与吞吐/)
  assert.match(get('log-hour-sub').textContent, /整点归并/)
})

test('a log page without measured durations says so instead of drawing a throughput', async () => {
  const { get, click, settle } = await mountPanel(undefined, undefined, (input) => {
    const page = sampleLog(input)
    page.hourly = page.hourly.map((h) => ({ ...h, tokPerSec: null, timed: 0 }))
    page.totals.tokPerSec = null
    page.rows = page.rows.map(({ durationMs, tokPerSec, ...row }) => row)
    return page
  })
  click('view', { view: 'log' })
  await settle()
  assert.match(get('log-speed').innerHTML, /没有可用的吞吐数据/)
  assert.match(get('log-speed').innerHTML, /Pi/)
  assert.doesNotMatch(get('log-speed').innerHTML, /<svg/)
  assert.match(get('log-table').innerHTML, /—/, 'a request without a duration shows a dash, not a zero')
})

test('more rows are appended with the next offset and the button says how many are left', async () => {
  const { calls, get, click, settle } = await mountPanel(undefined, undefined, (input) => {
    const page = sampleLog(input)
    page.total = 30
    return page
  })
  click('view', { view: 'log' })
  await settle()
  assert.equal(get('log-more').hidden, false)
  assert.match(get('log-more').textContent, /还有 18 笔/)
  get('log-more').listeners.click()
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: '7d', includeCache: true, offset: 12, limit: 100 })
  assert.equal(get('log-more').hidden, false)
})

test('the log model picker lists the models of the window, narrows the requests and returns to all of them', async () => {
  const { calls, get, click, settle } = await mountPanel()
  click('view', { view: 'log' })
  await settle()
  const select = get('log-model')
  assert.match(select.innerHTML, /全部模型/)
  assert.match(select.innerHTML, /deepseek-v4\.1-flash/)
  assert.equal(select.value, '', 'everything is shown at first')

  select.listeners.change({ target: { value: 'deepseek-v4.1-flash' } })
  await settle()
  const asked = calls.filter((c) => c.name === 'usage.log').at(-1).input
  assert.deepEqual(asked.models, ['deepseek-v4.1-flash'])
  assert.equal(asked.offset, 0)
  assert.match(get('log-sub').textContent, /只看 deepseek-v4\.1-flash/)

  // Going back to every model drops the filter again.
  select.listeners.change({ target: { value: '' } })
  await settle()
  assert.equal('models' in calls.filter((c) => c.name === 'usage.log').at(-1).input, false)
  assert.equal(get('log-sub').textContent.includes('只看'), false)
});

test('one local day turns the hour chart into that day and narrows the requests', async () => {
  const { calls, get, click, settle } = await mountPanel()
  click('ranges', { range: 'custom' })
  get('start-date').value = get('end-date').value = '2026-11-03'
  get('date-apply').listeners.click()
  await settle()
  click('view', { view: 'log' })
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: 'custom', includeCache: true, startDate: '2026-11-03', endDate: '2026-11-03', offset: 0, limit: 100 })
  assert.match(get('log-hour-title').textContent, /2026-11-03 每小时用量与吞吐/)
  assert.match(get('log-hour-sub').textContent, /这一天/)
})

test('switching back to usage does not refetch the report', async () => {
  const { calls, get, click, settle } = await mountPanel()
  click('view', { view: 'log' })
  await settle()
  const before = calls.length
  click('view', { view: 'usage' })
  await settle()
  assert.equal(calls.length, before, 'the report is already loaded and reused')
  assert.equal(get('content').hidden, false)
  assert.equal(get('log').hidden, true)
})

test('an Antigravity provider gets its own label and colour in the provider list', async () => {
  const { get } = await mountPanel((input) => {
    const report = sampleReport(input.range, input.includeCache)
    report.providers = ['claude', 'antigravity']
    report.byProvider = [
      { provider: 'claude', total: 200000, costUsd: 20, share: 0.7 },
      { provider: 'antigravity', total: 80000, costUsd: 6, share: 0.3 },
    ]
    report.seriesByProvider = [
      { provider: 'claude', daily: report.daily },
      { provider: 'antigravity', daily: report.daily.map((d) => ({ ...d, total: d.total / 2 })) },
    ]
    return report
  })
  assert.match(get('providers').innerHTML, /Antigravity/)
  assert.match(get('ov-providers').innerHTML, /Antigravity/)
  assert.match(get('trend').innerHTML, /var\(--s5\)/, 'antigravity draws in the fifth series colour')
});

test('panel shows an error state when the worker fails', async () => {
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  const { els, document } = fakeDom()
  const orca = { plugin: { request: async () => { throw new Error('unavailable') }, on() {} }, on() {} }
  vm.runInContext(script, vm.createContext({ document, orca, window: {}, console, Date, Intl, JSON, Math }))
  await new Promise((r) => setTimeout(r, 20))
  assert.match(els.get('status').textContent, /unavailable/)
  assert.equal(els.get('status').hidden, false)
})

// A worker answer for usage.log: twelve of the day's requests, two of them with a measured duration.
function sampleLog({ offset = 0, limit = 100 } = {}) {
  const rows = Array.from({ length: 12 }, (_, i) => {
    const ts = new Date(2026, 10, 3, 20 - i, 5).toISOString()
    const base = { ts, ms: Date.parse(ts), provider: i % 3 ? 'pi' : 'claude', model: i % 3 ? 'deepseek-v4.1-flash' : 'claude-opus-5-5', project: i % 2 ? 'pyrosome' : 'webhooks', sessionId: `s${i}`, cwd: '/w/pyrosome', host: 'local', input: 1000 + i * 10, output: 500 + i, cacheRead: 2000, cacheWrite: 40, usd: 0.5 }
    if (i < 2) Object.assign(base, { durationMs: 1000, tokPerSec: i ? 20 : 80 })
    return base
  })
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, requests: hour === 20 ? 2 : 0, input: hour === 20 ? 2000 : 0, output: hour === 20 ? 1000 : 0, cacheRead: 0, cacheWrite: 0, tokens: hour === 20 ? 3000 : 0, uncached: hour === 20 ? 3000 : 0, costUsd: hour === 20 ? 1 : 0, output_: 0, durationMs: hour === 20 ? 2000 : 0, timed: hour === 20 ? 2 : 0, tokPerSec: hour === 20 ? 50 : null }))
  return {
    day: null, offset, limit, total: 12,
    models: ['claude-opus-5-5', 'deepseek-v4.1-flash'],
    rows: rows.slice(offset, offset + limit),
    hourly,
    totals: { requests: 12, tokens: 36000, uncached: 12000, output: 6000, usd: 6, timed: 2, tokPerSec: 50 },
  }
}

async function mountPanel(makeReport = (input) => sampleReport(input.range, input.includeCache), settings, makeLog = (input) => sampleLog(input)) {
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  const { els, document } = fakeDom()
  const calls = []
  const pluginEvents = {}
  // Price requests (the footer line) are not part of what these tests check.
  const orca = { plugin: { request: async (name, input) => { if (name.startsWith('prices.')) return null; calls.push(JSON.parse(JSON.stringify({ name, input }))); return name === 'usage.log' ? makeLog(input) : makeReport(input) }, on(name, handler) { pluginEvents[name] = handler } }, on() {}, settings }
  const viewport = { innerWidth: 320, innerHeight: 600 }
  const events = {}
  vm.runInContext(script, vm.createContext({ document, orca, window: viewport, addEventListener: (name, handler) => { events[name] = handler }, console, Date, Intl, JSON, Math, setTimeout, clearTimeout }))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  await settle()
  const get = (id) => els.get(id)
  const click = (id, dataset) => get(id).listeners.click({ target: { closest: () => ({ dataset }) } })
  return { calls, get, click, settle, viewport, events, pluginEvents }
}

test('custom dates validate before requesting, allow one local day, and presets discard dates', async () => {
  const { calls, get, click, settle } = await mountPanel()
  click('ranges', { range: 'custom' })
  assert.equal(get('start-date').min, '2020-01-01')
  assert.equal(get('end-date').min, '2020-01-01')
  assert.equal(get('custom-range').hidden, false)
  assert.equal(calls.length, 1, 'opening the editor does not query')
  for (const [start, end] of [['0000-01-01', '2026-11-03'], ['2026-02-30', '2026-03-01'], ['2026-11-03', '2026-11-02'], ['', '2026-11-03'], ['2999-01-01', '2999-01-01']]) {
    get('start-date').value = start
    get('end-date').value = end
    get('date-apply').listeners.click()
    await settle()
    assert.equal(calls.length, 1, 'invalid dates do not reach the worker')
    assert.equal(get('date-error').hidden, false)
  }
  get('start-date').value = get('end-date').value = '2026-11-03'
  get('date-apply').listeners.click()
  await settle()
  assert.deepEqual(calls.at(-1), { name: 'usage.report', input: { range: 'custom', includeCache: true, startDate: '2026-11-03', endDate: '2026-11-03' } })
  assert.equal(get('date-error').hidden, true)
  assert.match(get('chips').innerHTML, /2026-11-03/)
  assert.match(get('date-hint').textContent, /本地时区日期/)
  click('ranges', { range: '30d' })
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: '30d', includeCache: true })
})

test('model checkboxes query multiple or zero models, search options, and All models resets', async () => {
  const { calls, get, settle } = await mountPanel()
  get('models').listeners.change({ target: { dataset: { model: 'gpt-5-codex' }, checked: false } })
  await settle()
  assert.deepEqual(calls.at(-1).input.models, ['claude-opus-5-5'])
  get('models').listeners.change({ target: { dataset: { model: 'gpt-5-codex' }, checked: true } })
  await settle()
  assert.deepEqual(calls.at(-1).input.models, ['claude-opus-5-5', 'gpt-5-codex'])
  get('models').listeners.change({ target: { dataset: { model: 'gpt-5-codex' }, checked: false } })
  await settle()
  get('models').listeners.change({ target: { dataset: { model: 'claude-opus-5-5' }, checked: false } })
  await settle()
  assert.deepEqual(calls.at(-1).input.models, [])
  assert.match(get('chips').innerHTML, /未选择模型/)
  get('model-search').listeners.input({ target: { value: 'gpt' } })
  assert.match(get('models').innerHTML, /gpt-5-codex/)
  assert.doesNotMatch(get('models').innerHTML, /claude-opus/)
  get('models-all').listeners.click()
  await settle()
  assert.equal(Object.hasOwn(calls.at(-1).input, 'models'), false)
  assert.equal(get('models-all').attrs['aria-pressed'], 'true')
})

test('cache switch requests consistent totals and token charts, and reset queries the worker', async () => {
  const { calls, get, settle } = await mountPanel()
  get('cache').listeners.change({ target: { checked: false } })
  await settle()
  assert.equal(calls.at(-1).input.includeCache, false)
  assert.equal(get('hero-total').textContent, '31.5k')
  assert.match(get('totals').innerHTML, /处理 Token<\/span><strong>31.5k/)
  assert.doesNotMatch(get('totals').innerHTML, /缓存读取|缓存写入/)
  assert.doesNotMatch(get('type-legend').innerHTML, /缓存读取|缓存写入/)
  assert.doesNotMatch(get('daily-legend').innerHTML, /缓存读取|缓存写入/)
  assert.doesNotMatch(get('mix-legend').innerHTML, /缓存读取|缓存写入/)
  assert.match(get('selection-summary').textContent, /不含缓存 Token/)
  get('filters-reset').listeners.click()
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: '7d', includeCache: true })
  assert.equal(get('chips').innerHTML, '')
})

test('the Default range setting picks the opening range and the one a cleared custom range returns to', async () => {
  const { calls, get, click, settle } = await mountPanel(undefined, { get: async (key) => (key === 'defaultRange' ? '1d' : undefined) })
  assert.deepEqual(calls, [{ name: 'usage.report', input: { range: '1d', includeCache: true } }])
  click('ranges', { range: 'custom' })
  get('start-date').value = get('end-date').value = '2026-11-03'
  get('date-apply').listeners.click()
  await settle()
  assert.equal(calls.at(-1).input.range, 'custom')
  get('chips').listeners.click({ target: { closest: () => ({ dataset: { clear: 'range' } }) } })
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: '1d', includeCache: true })
})

test('an unknown or unreadable Default range opens on 7d, and a range picked before it is read is kept', async () => {
  for (const settings of [{ get: async () => '1y' }, { get: async () => { throw new Error('settings offline') } }]) {
    const { calls } = await mountPanel(undefined, settings)
    assert.deepEqual(calls, [{ name: 'usage.report', input: { range: '7d', includeCache: true } }])
  }
  let answer
  const { calls, click, settle } = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  assert.equal(calls.length, 0, 'the first report waits for the setting')
  click('ranges', { range: '30d' })
  await settle()
  answer('1d')
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['30d'])
})

test('a background load, a failed pick or a no-op pick before the Default range is read', async () => {
  // A usage.changed load that starts without the setting is redone on the default.
  let answer
  let mounted = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  mounted.pluginEvents['usage.changed']()
  await mounted.settle()
  answer('30d')
  await mounted.settle()
  await mounted.settle()
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['7d', '30d'])
  // A picked range whose load fails is kept.
  let fail = true
  mounted = await mountPanel((input) => { if (fail) { fail = false; throw new Error('worker down') } return sampleReport(input.range, input.includeCache) }, { get: () => new Promise((resolve) => { answer = resolve }) })
  mounted.click('ranges', { range: '90d' })
  await mounted.settle()
  answer('1d')
  await mounted.settle()
  // The failed 90d is retried on 90d, not replaced by the default.
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['90d', '90d'])
  // Clicking the range already shown counts as a pick.
  mounted = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  mounted.click('ranges', { range: '7d' })
  answer('1d')
  await mounted.settle()
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['7d'])
})

test('a Default range changed while the panel is open is where a cleared custom range goes', async () => {
  let saved = '7d'
  let listener
  const { calls, get, click, settle } = await mountPanel(undefined, { get: async () => saved, onDidChange: (fn) => { listener = fn } })
  saved = '90d'
  listener({ key: 'defaultRange' })
  await settle()
  click('ranges', { range: 'custom' })
  get('start-date').value = get('end-date').value = '2026-11-03'
  get('date-apply').listeners.click()
  await settle()
  get('chips').listeners.click({ target: { closest: () => ({ dataset: { clear: 'range' } }) } })
  await settle()
  assert.deepEqual(calls.at(-1).input, { range: '90d', includeCache: true })
})

test('an older Default range read that answers last does not win over a newer one', async () => {
  const answers = []
  let listener
  const { calls, settle } = await mountPanel(undefined, { get: () => new Promise((resolve) => answers.push(resolve)), onDidChange: (fn) => { listener = fn } })
  listener({ key: 'defaultRange' })
  await settle()
  answers[1]('90d')
  await settle()
  answers[0]('30d')
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['90d'])
})

test('a Default range changed while the first read is out opens on the newer value', async () => {
  const answers = []
  let listener
  const { calls, settle } = await mountPanel(undefined, { get: () => new Promise((resolve) => answers.push(resolve)), onDidChange: (fn) => { listener = fn } })
  listener({ key: 'defaultRange' })
  answers[0]('7d')
  await settle()
  assert.equal(calls.length, 0, 'the panel waits for the newest read')
  answers[1]('90d')
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['90d'])
})

test('a slow Default range read does not hold the first report back', async () => {
  let answer
  const { calls, settle } = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  await new Promise((resolve) => setTimeout(resolve, 1600))
  assert.deepEqual(calls.map((c) => c.input.range), ['7d'])
  answer('30d')
  await settle()
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['7d', '30d'])
})

test('a settings read that throws at once, a stuck first read, or an open Custom picker', async () => {
  // A get that throws synchronously opens on 7d.
  let mounted = await mountPanel(undefined, { get: () => { throw new Error('no settings') } })
  await mounted.settle()
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['7d'])
  // A stuck first read doesn't block a newer answer.
  let listener
  const answers = []
  mounted = await mountPanel(undefined, { get: () => new Promise((resolve) => answers.push(resolve)), onDidChange: (fn) => { listener = fn } })
  listener({ key: 'defaultRange' })
  await mounted.settle()
  answers[1]('90d')
  await mounted.settle()
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['90d'])
  // Opening the Custom picker counts as a pick, so the default doesn't move the range under it.
  let answer
  mounted = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  mounted.click('ranges', { range: 'custom' })
  answer('30d')
  await mounted.settle()
  assert.deepEqual(mounted.calls.map((c) => c.input.range), ['7d'])
  assert.equal(mounted.get('custom-range').hidden, false)
})

test('a valid Default range answer is kept when a newer read fails', async () => {
  const answers = []
  let listener
  const { calls, settle } = await mountPanel(undefined, { get: () => new Promise((resolve, reject) => answers.push({ resolve, reject })), onDidChange: (fn) => { listener = fn } })
  listener({ key: 'defaultRange' })
  await settle()
  answers[0].resolve('30d')
  await settle()
  answers[1].reject(new Error('host did not answer'))
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['30d'])
})

test('a custom range cleared before the Default range is read moves to it once read', async () => {
  let answer
  const { calls, get, click, settle } = await mountPanel(undefined, { get: () => new Promise((resolve) => { answer = resolve }) })
  click('ranges', { range: 'custom' })
  get('start-date').value = get('end-date').value = '2026-11-03'
  get('date-apply').listeners.click()
  await settle()
  get('chips').listeners.click({ target: { closest: () => ({ dataset: { clear: 'range' } }) } })
  await settle()
  answer('30d')
  await settle()
  await settle()
  assert.deepEqual(calls.map((c) => c.input.range), ['custom', '7d', '30d'])
})

test('date and model detail shows exact escaped rows and visible sort choices', async () => {
  const hostile = '<img src=x onerror=alert(1)>'
  const { get, click, settle } = await mountPanel((input) => {
    const report = sampleReport(input.range, input.includeCache)
    report.byDayModel[1].model = hostile
    report.models.push(hostile)
    return report
  })
  assert.doesNotMatch(get('models').innerHTML, /<img/)
  click('bd-mode', { mode: 'day-model' })
  assert.match(get('breakdown').innerHTML, /缓存读取/)
  assert.match(get('breakdown').innerHTML, /1,234,567/)
  assert.match(get('breakdown').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(get('breakdown').innerHTML, /<img/)
  const position = (text) => get('breakdown').innerHTML.indexOf(`<td>${text}</td>`)
  assert.ok(position('2026-11-03') < position('2026-11-02'))
  get('rank-sort').listeners.change({ target: { value: 'date-asc' } })
  assert.ok(position('2026-11-02') < position('2026-11-03'))
  get('rank-sort').listeners.change({ target: { value: 'tokens-desc' } })
  assert.ok(position('2026-11-02') < position('2026-11-03'))
  get('rank-sort').listeners.change({ target: { value: 'tokens-asc' } })
  assert.ok(position('2026-11-03') < position('2026-11-02'))
  get('cache').listeners.change({ target: { checked: false } })
  await settle()
  assert.match(get('rank-note').textContent, /不包含缓存 Token/)
  assert.match(get('breakdown').innerHTML, /1,238,567/)
})

test('history empty state retains controls, source coverage and model options', async () => {
  const { get, click } = await mountPanel((input) => {
    const report = sampleReport(input.range, input.includeCache)
    report.totals.turns = 0
    report.byDayModel = []
    report.sources[0].latestRecordAt = '2026-11-03T10:00:00Z'
    return report
  })
  assert.equal(get('content').hidden, false)
  assert.match(get('status').textContent, /没有用量记录/)
  assert.match(get('models').innerHTML, /gpt-5-codex/)
  assert.match(get('sources').innerHTML, /最近一次用量/)
  click('bd-mode', { mode: 'day-model' })
  assert.match(get('breakdown').innerHTML, /colspan="9"/)
})


test('source roots have distinct short labels, neutral empty state and visible warnings', async () => {
  const first = '/Users/neo/Library/Application Support/orca/codex-accounts/26d99d19-example/home'
  const second = '/Users/neo/Library/Application Support/orca/codex-accounts/77aa1234-example/home'
  const { get } = await mountPanel((input) => {
    const report = sampleReport(input.range, input.includeCache)
    report.sources = [report.sources[0],
      { kind: 'folder', label: first, path: first, provider: 'codex', source: 'orca', state: 'ok', records: 5, latestRecordAt: '2026-11-03T10:00:00Z' },
      { kind: 'folder', label: second, path: second, provider: 'codex', source: 'orca', state: 'ok', records: 2 },
      { kind: 'folder', label: '/Users/neo/.claude', path: '/Users/neo/.claude', provider: 'claude', source: 'default', state: 'empty', records: 0, message: 'Folder not found' },
      { kind: 'folder', label: '/missing/backup', path: '/missing/backup', provider: 'claude', source: 'extra', state: 'warning', records: 0, message: 'Folder not found' },
    ]
    return report
  })
  const html = get('sources').innerHTML
  assert.match(html, /Codex · Orca 目录 · 26d99d19/)
  assert.match(html, /Codex · Orca 目录 · 77aa1234/)
  assert.match(html, /Claude · 默认位置 · .claude/)
  assert.match(html, /class="src empty"/)
  assert.match(html, /无转录/)
  assert.match(html, /<details class="source-details"><summary>4 个本地来源 · 1 条警告/)
  assert.ok(html.indexOf('class="src warning"') < html.indexOf('<details'), 'warnings are visible outside the collapsed root list')
  assert.match(html, /来源：orca/)
  assert.match(html, /最近一次用量/)
  assert.ok(html.includes(first), 'the full root path remains in the tooltip')
  assert.doesNotMatch(html, /<span class="name">\/Users/)
  assert.match(get('notice').textContent, /^Claude · 文件夹 · backup: Folder not found$/)
})


test('an open filters menu stays within the resized viewport and leaves its footer reachable', async () => {
  const { get, viewport, events } = await mountPanel()
  const pop = get('filters-pop')
  pop.hidden = true
  let anchor = { left: 700, top: 180, bottom: 214, width: 100, height: 34 }
  get('filters-btn').getBoundingClientRect = () => anchor
  pop.getBoundingClientRect = () => ({ width: 300, height: 680 })
  viewport.innerWidth = 1000
  viewport.innerHeight = 900
  get('filters-btn').listeners.click()
  const box = () => ({ left: anchor.left + parseFloat(pop.style.left), right: anchor.left + parseFloat(pop.style.left) + 300 })
  assert.ok(box().left >= 8 && box().right <= 992, 'opening clamps the menu to the viewport')
  viewport.innerWidth = 380
  viewport.innerHeight = 600
  anchor = { ...anchor, left: 145, top: 250, bottom: 284 }
  events.resize()
  assert.ok(box().left >= 8 && box().right <= 372, 'resizing repositions an already open menu immediately')
  assert.ok(parseFloat(pop.style.maxHeight) <= 600 - anchor.bottom - 6, 'the menu scroll area accounts for its distance from the top')
  assert.equal(pop.style.bottom, 'auto')
  // A short window leaves more room above the anchor; the same scroll area keeps Done reachable.
  viewport.innerHeight = 340
  events.resize()
  assert.equal(pop.style.top, 'auto')
  assert.equal(pop.style.bottom, 'calc(100% + 6px)')
  assert.ok(parseFloat(pop.style.maxHeight) <= anchor.top - 6)
  assert.equal(pop.hidden, false)
  get('filters-done').listeners.click()
  assert.equal(pop.hidden, true)
})

test('Breakdown takes the custom dates but not the model and cache-token options, which it hides', async () => {
  const { calls, get, click, settle } = await mountPanel()
  get('start-date').value = '2026-11-01'
  get('end-date').value = '2026-11-02'
  get('date-apply').listeners.click()
  await settle()
  get('cache').listeners.change({ target: { checked: false } })
  await settle()
  click('view', { view: 'breakdown' })
  await settle()
  await settle()
  const request = calls.find((c) => c.name === 'usage.breakdown')
  assert.deepEqual(request.input, { range: 'custom', startDate: '2026-11-01', endDate: '2026-11-02' })
  assert.equal(get('sec-models').hidden, true)
  assert.doesNotMatch(get('chips').innerHTML, /No cache tokens/)
  assert.match(get('chips').innerHTML, /2026-11-01/)
})

test('a folder pill is a toggle: clicking it asks the worker to turn the folder off or on, then reloads', async () => {
  let off = false
  const { calls, get, settle } = await mountPanel((input) => {
    const report = sampleReport(input.range, input.includeCache)
    report.sources = [report.sources[0],
      { kind: 'folder', label: '/Users/neo/.codex', path: '/Users/neo/.codex', provider: 'codex', source: 'default', state: off ? 'off' : 'ok', records: off ? 0 : 3 },
    ]
    return report
  })
  assert.match(get('sources').innerHTML, /<button type="button" class="src ok" data-source-path="\/Users\/neo\/\.codex" aria-pressed="true"/)
  assert.doesNotMatch(get('sources').innerHTML, /<button[^>]*data-source-path[^>]*>[^]*This machine/, 'the machine pill is not a toggle')
  const button = { disabled: false, dataset: { sourcePath: '/Users/neo/.codex' }, getAttribute: () => 'true' }
  off = true
  get('sources').listeners.click({ target: { closest: () => button } })
  await settle()
  const toggle = calls.find((c) => c.name === 'sources.toggle')
  assert.deepEqual(toggle.input, { path: '/Users/neo/.codex', enabled: false })
  assert.equal(calls.at(-1).name, 'usage.report', 'the report reloads after the toggle')
  assert.match(get('sources').innerHTML, /class="src off"[^>]*aria-pressed="false"/)
  assert.match(get('sources').innerHTML, /已关闭/)
  assert.match(get('sources').innerHTML, /1 个本地来源 · 已关闭 1/)
})
