// Breakdown view, Sync dialog and price line: HTML builders from the worker's replies. No DOM
// access and no dollar math beyond formatting; panel.js owns events and requests.
import { esc, sparkline, PROVIDER_LABELS } from './charts.mjs'

export const BUCKET_INFO = {
  startup: { label: '会话启动', tip: '首条消息之前加载的系统提示词、工具定义与记忆文件。', color: 'var(--s4)' },
  tools: { label: '工具结果', tip: '文件读取、命令输出等工具结果，只要还在上下文里，每轮都会重新付费。', color: 'var(--s1)' },
  messages: { label: '你输入的消息', tip: '你打字输入的内容，一直留在上下文里。', color: 'var(--s3)' },
  injected: { label: '注入的上下文', tip: 'harness 加进对话的提醒、附件与钩子输出。', color: 'var(--s5)' },
  replies: { label: '此前的回答', tip: '模型自己早先的回答，每轮都会重读。', color: 'var(--q4)' },
  compaction: { label: '压缩摘要', tip: '长会话被压缩时写下的摘要。', color: 'var(--s7)' },
  rebuilds: { label: '缓存重建', tip: '缓存在过期、切换模型或压缩之后被重新写入的部分。', color: 'var(--s2)' },
  output: { label: '输出', tip: '模型写出的 Token：回答、工具调用与思考。', color: 'var(--s6)' },
  unattributed: { label: '无法归因', tip: '转录无法解释的上下文增长。', color: 'var(--muted-fg)' },
}

export const REASON_INFO = {
  ssh: { label: 'SSH 主机上的用量', next: 'Breakdown 只读取本机的转录。SSH 上的用量仍计入总量。' },
  opencode: { label: 'OpenCode 会话', next: 'Breakdown 只读取 Claude Code 与 Codex 转录。OpenCode 用量仍计入总量。' },
  pi: { label: 'Pi 会话', next: 'Breakdown 只读取 Claude Code 与 Codex 转录。Pi 用量仍计入总量。' },
  zstd: { label: '压缩的 Codex 文件', next: '这个 Orca 自带的 Node.js 读不了 .zst 文件。升级 Orca 即可解决。' },
  'too-large': { label: '文件太大', next: '超过 64 MB 的压缩转录会被跳过。' },
  parse: { label: '读不了的文件', next: '看上面“本机”的状态，可以知道哪些文件读失败了。' },
  unmatched: { label: '无转录细节', next: '用量对应的转录行已经没了或被裁剪过，所以能计数但无法拆分。' },
  unpriced: { label: '无价格的模型', next: '在 price-overrides.json 里补上价格（见 README）。' },
}

export const FINDING_INFO = {
  'large-results': { title: '大块工具结果留在了上下文里', what: '这个对象产出的内容一直留在上下文里，后续每轮都要重新付费。' },
  'repeat-reads': { title: '同一个文件被重复读取', what: '这个文件中间没有任何修改，却被又读了一次。' },
  'cache-expired': { title: '间隔之后缓存过期', what: '停顿超过缓存寿命后，整段上下文被重新写入缓存。' },
}

const SYNC_STATUS = {
  agree: '两边一致',
  disagree: '来源不一致',
  single: '仅一个来源',
  flagged: '请核对',
  new: '新模型',
  removed: '没有来源列出',
  overridden: '已由你的覆盖文件设定',
}
const FIELD_LABELS = {
  input: '输入',
  output: '输出',
  cacheRead: '缓存读取',
  'cacheWrite.5m': '缓存写入（5 分钟）',
  'cacheWrite.1h': '缓存写入（1 小时）',
  'cacheWrite.default': '缓存写入',
}
function fieldLabel(field) {
  const whole = /^tier\.(\d+)$/.exec(field)
  if (whole) return `超过 ${Number(whole[1]) / 1000}k 提示词的阶梯价`
  const tier = /^tier\.(\d+)\.(.+)$/.exec(field)
  if (!tier) return FIELD_LABELS[field] || field
  return `${FIELD_LABELS[tier[2]] || tier[2]}，超过 ${Number(tier[1]) / 1000}k 的提示词`
}

// Dollars: ≈ when estimated, + when some usage is unpriced, — when the value can't be measured.
export function usd(n, { est = false, plus = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  const v = Number(n)
  if (v > 0 && v < 0.0001) return `${est ? '≈' : ''}<$0.0001`
  const text = v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 0.995 || v === 0 ? v.toFixed(2) : v.toFixed(v < 0.01 ? 4 : 3)
  return `${est ? '≈' : ''}$${text}${plus ? '+' : ''}`
}

function share(x) {
  const v = (Number(x) || 0) * 100
  return v > 0 && v < 0.1 ? '<0.1%' : `${v.toFixed(1)}%`
}

function tipAttr(title, rows) {
  return `data-tip="${esc(JSON.stringify({ title, rows }))}"`
}

export function headline(view) {
  const t = view.totals
  const unpriced = (t.unpricedModels || []).length > 0
  const rest = t.usageUsd - t.analysedUsd
  const buckets = view.buckets || []
  const bar = buckets.length
    ? `<div class="stack" role="img" aria-label="花费构成">${buckets
        .map((b) => {
          const info = BUCKET_INFO[b.key] || { label: b.key, tip: '', color: 'var(--muted-fg)' }
          return `<span style="flex-grow:${Math.max(b.share, 0.004)};background:${info.color}" ${tipAttr(info.label, [['成本', usd(b.usd, { est: b.est })], ['占比', share(b.share)], ['', info.tip]])}></span>`
        })
        .join('')}</div>`
    : ''
  const list = buckets
    .map((b) => {
      const info = BUCKET_INFO[b.key] || { label: b.key, tip: '', color: 'var(--muted-fg)' }
      return `<li title="${esc(info.tip)}"><span class="sw" style="background:${info.color}"></span><span class="name">${esc(info.label)}</span><span class="amt">${esc(usd(b.usd, { est: b.est }))}</span><span class="pct">${esc(share(b.share))}</span></li>`
    })
    .join('')
  const sub = rest > 0.005
    ? `${usd(t.analysedUsd)} 已拆解 · ${usd(rest)} 未分析（见下）`
    : '全部已拆解'
  return `<div class="bd-head"><div><span class="label">总花费</span><strong class="bd-total">${esc(usd(t.usageUsd, { plus: unpriced }))}</strong><p class="muted">${esc(sub)}</p></div></div>${bar}<ul class="bucket-list">${list}</ul>`
}

const OWN_TARGETS = {
  startup: '会话启动',
  replies: '此前的回答',
  output: '输出',
  unattributed: '无法归因',
  other: '（其它）',
  'rebuild:idle': '停顿后缓存重建',
  'rebuild:model': '切换模型后缓存重建',
  'rebuild:compaction': '压缩后缓存重建',
  'rebuild:other': '其它缓存重写',
}

export function tree(view) {
  const path = view.path || []
  const crumbs = [`<button class="crumb" data-depth="0"${path.length === 0 ? ' aria-current="page"' : ''}>全部项目</button>`]
  path.forEach((key, i) => {
    const label = i === 0 ? lastSegment(key) : key
    crumbs.push(`<span class="sep" aria-hidden="true">›</span><button class="crumb" data-depth="${i + 1}"${i === path.length - 1 ? ' aria-current="page"' : ''} title="${esc(key)}">${esc(label)}</button>`)
  })
  const nodes = view.nodes || []
  const top = Math.max(0, ...nodes.map((n) => n.usd))
  const rows = nodes
    .map((n) => {
      const width = top > 0 ? Math.max(1.5, (n.usd / top) * 100) : 0
      const label = n.kind === 'bucket' ? OWN_TARGETS[n.key] ?? n.label : n.label || n.key
      const name = `<span class="nm"><span class="txt">${esc(label)}</span>${n.kind === 'folder' || n.kind === 'group' || n.kind === 'project' ? '' : `<small>${esc(kindLabel(n.kind))}</small>`}</span><span class="share-line" style="width:${width.toFixed(1)}%"></span>`
      const cells = `<span class="amt">${esc(usd(n.usd, { est: n.est }))}</span><span class="pct">${esc(share(n.share))}</span>`
      return n.children
        ? `<li><button class="node" data-key="${esc(n.key)}" title="${esc(n.key)}"><span class="cell-name">${name}</span>${cells}<span class="chev" aria-hidden="true">›</span></button></li>`
        : `<li><div class="node leaf" title="${esc(n.key)}"><span class="cell-name">${name}</span>${cells}<span class="chev" aria-hidden="true"></span></div></li>`
    })
    .join('')
  const more = view.more ? `<li class="more muted">+ 还有 ${view.more.count} 项 · ${esc(usd(view.more.usd))}</li>` : ''
  const empty = nodes.length ? '' : '<li class="muted empty">这个范围内没有可分析的内容。</li>'
  return { crumbs: crumbs.join(''), rows: `<ul class="nodes">${rows}${more}${empty}</ul>` }
}

function kindLabel(kind) {
  return { file: '文件', command: '命令', agent: '子代理', web: '网页', mcp: 'MCP', tool: '工具', messages: '消息', injected: '注入', summary: '摘要', bucket: '' }[kind] ?? ''
}

function lastSegment(path) {
  const parts = String(path).split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] || String(path)
}

// They overlap, so no total is shown.
export function findings(view) {
  const list = view.findings || []
  if (!list.length) return '<p class="muted empty">这个范围内没有超过 $1 的模式。</p>'
  return list
    .map((f) => {
      const info = FINDING_INFO[f.kind] || { title: f.kind, what: '' }
      const where = f.kind === 'cache-expired' ? lastSegment(f.where.project) : `${f.where.label} · ${lastSegment(f.where.project)}`
      const spark = (f.daily || []).length > 1 ? `<span class="spark-wrap" aria-hidden="true">${sparkline(f.daily.map((d) => d[1]), { width: 80, height: 22 })}</span>` : ''
      const facts = [`${f.facts?.sessions ?? 0} 个会话`, f.lastSeen ? `最近 ${f.lastSeen}` : ''].filter(Boolean).join(' · ')
      return `<article class="finding"><header><span class="tag">${esc(PROVIDER_LABELS[f.harness] ?? f.harness ?? '未知')}</span><h3>${esc(info.title)}</h3></header>
<p class="where" title="${esc(f.where.key)}">${esc(where)}</p>
<div class="fig"><div><span class="label">这个模式的成本</span><strong>${esc(usd(f.usd, { est: f.est }))}</strong></div>${spark}</div>
<p class="muted">${esc(info.what)} ${esc(facts)}。</p>
<footer><button class="btn" data-explain="${esc(f.id)}">解释…</button></footer></article>`
    })
    .join('')
}

export function notAnalysed(view) {
  const rows = view.totals.notAnalysed || []
  if (!rows.length) return ''
  const models = (view.totals.unpricedModels || []).map((m) => m.model).filter(Boolean)
  const items = rows
    .map((r) => {
      const info = REASON_INFO[r.reason] || { label: r.reason, next: '' }
      const extra = r.reason === 'unpriced' && models.length ? ` 模型：${models.slice(0, 6).join(', ')}${models.length > 6 ? '…' : ''}。` : ''
      return `<li><div class="row"><span class="name">${esc(info.label)}</span><span class="amt">${esc(usd(r.usd))}</span><span class="pct muted">${r.turns.toLocaleString()} 轮</span></div><p class="muted">${esc(info.next + extra)}</p></li>`
    })
    .join('')
  return `<header><h2>未计入拆解</h2></header><ul class="reasons">${items}</ul>`
}

export function legend(view) {
  const h = view.health || {}
  const parts = [`≈ 估算拆分（占已分析成本的 ${share(h.splitShare)}）`, '+ 部分模型无价格', '— 无法测量']
  if (h.dedupeUsd > 0.005) parts.push(`${usd(h.dedupeUsd)} 来自续接会话的重复历史，已排除`)
  if (h.explainUsd > 0.005) parts.push(`${usd(h.explainUsd)} 来自 Explain 会话，不计入发现项`)
  return parts.join(' · ')
}

export function priceLine(status) {
  if (!status) return ''
  const from = status.overlay
    ? `价格：已同步 ${String(status.overlay.appliedAt || '').slice(0, 10)}${status.overlay.sources?.length ? `，来源 ${status.overlay.sources.join(' + ')}` : ''}`
    : `价格：内置 ${status.asOf || ''}`
  const o = status.overrides
  const own = o ? ` · <span title="${esc(o.file)}">+ 你的覆盖（${o.models} 个模型${o.aliases ? `，${o.aliases} 个别名` : ''}）</span>` : ''
  const problems = o?.problems?.length ? `<p class="warn">覆盖文件：${esc(o.problems.slice(0, 3).join('；'))}${o.problems.length > 3 ? '…' : ''}</p>` : ''
  const actions = [
    '<button class="link-btn" data-price="sync">同步价格…</button>',
    status.canUndo ? '<button class="link-btn" data-price="undo">撤销</button>' : '',
    status.overlay ? '<button class="link-btn" data-price="reset">恢复内置价格</button>' : '',
  ].join('')
  return `<span class="muted">${esc(from)}${own}</span>${actions}${problems}`
}

// A row whose sources give exactly the price in use changes nothing, so it is counted, not listed.
export function changedSyncRows(rows = []) {
  return rows.filter((r) => {
    const values = [r.litellm, r.modelsdev].filter((v) => v !== null && v !== undefined)
    return r.status === 'removed' || r.current === null || r.current === undefined || values.some((v) => Math.abs(v - r.current) > 1e-9)
  })
}

export function syncBody(result) {
  const sources = (result.sources || [])
    .map((s) => `<li class="${s.ok ? 'ok' : 'bad'}">${esc(s.name === 'litellm' ? 'LiteLLM' : s.name)}：${s.ok ? `已获取 ${s.rows} 个你所用模型的价格` : esc(s.error || '拉取失败')}</li>`)
    .join('')
  const all = result.rows || []
  const rows = changedSyncRows(all)
  const same = all.length - rows.length
  const impact = result.impact
    ? `<p class="impact">最近 30 天：现在 <strong>${esc(usd(result.impact.beforeUsd))}</strong> → 按预勾选的更改后 <strong>${esc(usd(result.impact.afterUsd))}</strong>。</p>`
    : ''
  const fmt = (v) => (v === null || v === undefined ? '—' : `$${Number(v)}`)
  // The price a ticked row applies (LiteLLM's, else models.dev's); the other source's follows when it differs.
  const proposed = (r) => {
    if (r.status === 'removed') return '移除'
    const first = r.litellm ?? r.modelsdev
    const other = r.litellm !== null && r.litellm !== undefined && r.modelsdev !== null && r.modelsdev !== undefined && Math.abs(r.litellm - r.modelsdev) > 1e-9
      ? `<span class="muted small">models.dev ${esc(fmt(r.modelsdev))}</span>`
      : ''
    return `${esc(fmt(first))}${other}`
  }
  const table = rows.length
    ? `<div class="table-wrap"><table class="bd sync"><thead><tr><th></th><th>每 1M Token 价格</th><th>现在</th><th>新价格</th></tr></thead><tbody>${rows
        .map((r) => {
          const id = `sync-${esc(r.key)}`
          const disabled = r.status === 'overridden' ? ' disabled' : ''
          const field = fieldLabel(r.field)
          return `<tr class="${esc(r.status)}"><td><input type="checkbox" id="${id}" data-key="${esc(r.key)}"${r.ticked ? ' checked' : ''}${disabled} aria-label="应用 ${esc(r.model)} ${esc(field)}"></td><td class="name"><label for="${id}">${esc(r.model)}</label><span class="sub">${esc(field)} <span class="chip-s ${esc(r.status)}">${esc(SYNC_STATUS[r.status] || r.status)}</span></span></td><td>${esc(fmt(r.current))}</td><td class="new">${proposed(r)}</td></tr>`
        })
        .join('')}</tbody></table></div>`
    : '<p class="muted">你用的每个模型价格都和来源一致。</p>'
  const matching = same > 0 && rows.length ? `<p class="muted small">另有 ${same} 条价格与你当前的设置一致，未列出。</p>` : ''
  const note = rows.some((r) => r.status === 'flagged')
    ? '<p class="muted small">“请核对”表示变动达 10 倍以上、付费模型价格为 0、或这个插件还不认识的按 Token 计价方式。这些永远不会被预勾选。</p>'
    : ''
  return `${impact}<ul class="src-list">${sources}</ul>${table}${matching}${note}`
}
