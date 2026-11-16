/**
 * DeepSeek 记录导入自检:宿主同款 new Function('ctx', src) 求值 main.js,假 ctx(带 ctx.tangu 桩)。
 * 夹具是自造的 DeepSeek 导出(不放真实聊天记录):mapping 树里有重新生成的分支、current_node、
 * THINK / FILE / SEARCH 片段、ISO 与秒级两种时间、空对话、旧式 { role, content } 消息;zip 用 node 自己打。
 * 覆盖:解析 / 分支选择 / 思考过程开关 / zip(deflate + stored)/ 设置页各阶段 / 导入流程(新建 Agent、
 * 失败与已存在的计数、最近一段)/ 双语词表键一致、英文侧零汉字。
 * 跑法:node check.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as A } from 'node:assert'
import { deflateRawSync } from 'node:zlib'

const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')

function load(locale = 'zh', tangu, code = src) {
  let api = null
  const settingsViews = []
  const commands = []
  const store = { data: null }
  const ctx = {
    getLocale: () => locale,
    subscribeLocale: () => () => {},
    loadData: async () => store.data,
    saveData: async (v) => { store.data = v },
    registerSettingsView: (v) => settingsViews.push(v),
    registerCommand: (c) => commands.push(c),
    ui: { mountSettingsPage: (_el, schema) => { const h = { schema, update: (s) => { h.schema = s }, dispose: () => {} }; return h } },
    app: { openSettings: (target) => { ctx.opened = target } },
    tangu,
    __expose: (o) => { api = o },
  }
  new Function('ctx', code)(ctx)
  return { api, ctx, settingsViews, commands, store }
}

// ── 夹具 ──
const T = Date.UTC(2026, 9, 1, 8, 0, 0)
const iso = (ms) => new Date(ms).toISOString()
const exportJson = [
  {
    id: 'conv-1', title: '写一首诗', inserted_at: iso(T), updated_at: iso(T + 600_000), current_node: '4',
    mapping: {
      root: { id: 'root', parent: null, children: ['1'], message: null },
      1: { id: '1', parent: 'root', children: ['2', '3'], message: { inserted_at: iso(T), model: 'deepseek-chat', files: [{ file_name: 'notes.pdf' }], fragments: [{ type: 'REQUEST', content: '写一首关于秋天的诗' }] } },
      2: { id: '2', parent: '1', children: [], message: { inserted_at: iso(T + 10_000), model: 'deepseek-reasoner', fragments: [{ type: 'THINK', content: '旧的思考' }, { type: 'RESPONSE', content: '被重新生成掉的旧回答' }] } },
      3: { id: '3', parent: '1', children: ['4'], message: { inserted_at: iso(T + 20_000), model: 'deepseek-reasoner', fragments: [{ type: 'THINK', content: '先想意象' }, { type: 'SEARCH', results: [] }, { type: 'RESPONSE', content: '秋风起兮白云飞' }] } },
      4: { id: '4', parent: '3', children: [], message: { inserted_at: (T + 600_000) / 1000, fragments: [{ type: 'REQUEST', content: '再短一点' }] } },
    },
  },
  { id: 'conv-empty', title: 'empty', mapping: { root: { id: 'root', parent: null, children: [], message: null } } },
  {
    id: 'conv-2', title: '', inserted_at: (T + 86_400_000) / 1000,
    // 没有 current_node:从根沿最后一个孩子往下走
    mapping: {
      a: { id: 'a', parent: null, children: ['b'], message: null },
      b: { id: 'b', parent: 'a', children: ['c', 'd'], message: { fragments: [{ type: 'REQUEST', content: 'hello there' }] } },
      c: { id: 'c', parent: 'b', children: [], message: { fragments: [{ type: 'RESPONSE', content: 'first try' }] } },
      d: { id: 'd', parent: 'b', children: [], message: { fragments: [{ type: 'RESPONSE', content: 'second try' }] } },
    },
  },
  { id: 'conv-3', title: 'legacy', messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a', reasoning_content: 'why' }] },
]
const exportText = JSON.stringify(exportJson)

function zip(entries) {
  const locals = [], centrals = []
  let offset = 0
  for (const { name, data, store } of entries) {
    const nameBuf = Buffer.from(name)
    const body = store ? data : deflateRawSync(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(store ? 0 : 8, 8)
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(store ? 0 : 8, 10)
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42)
    locals.push(lh, nameBuf, body); centrals.push(ch, nameBuf)
    offset += 30 + nameBuf.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
  const out = Buffer.concat([...locals, cd, eocd])
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length)
}

// ── 解析 ──
{
  const { api } = load('zh')
  const r = api.parseExport(exportText, { reasoning: true })
  A.equal(r.skipped, 1, '空对话跳过')
  A.deepEqual(r.conversations.map((c) => c.id), ['conv-1', 'conv-2', 'conv-3'])
  const c1 = r.conversations[0]
  A.equal(c1.title, '写一首诗')
  A.equal(c1.createdAt, T)
  A.equal(c1.updatedAt, T + 600_000)
  A.equal(c1.messages.length, 3, '沿 current_node 那一支,重新生成掉的旧回答不要')
  A.equal(c1.messages[0].role, 'user')
  A.equal(c1.messages[0].content, '[附件:notes.pdf]\n\n写一首关于秋天的诗')
  A.equal(c1.messages[0].timestamp, T)
  A.equal(c1.messages[1].role, 'assistant')
  A.equal(c1.messages[1].reasoning, '先想意象')
  A.ok(c1.messages[1].content.startsWith('秋风起兮白云飞\n\n[这条回答用到了联网搜索'))
  A.equal(c1.messages[1].model, 'deepseek-reasoner')
  A.equal(c1.messages[2].timestamp, T + 600_000, '秒级时间换成毫秒')
  const c2 = r.conversations[1]
  A.deepEqual(c2.messages.map((m) => m.content), ['hello there', 'second try'], '没有 current_node 时取最后一个孩子')
  A.equal(c2.title, '未命名对话')
  A.equal(c2.createdAt, T + 86_400_000)
  A.equal(r.conversations[2].messages[1].reasoning, 'why')
  const noThink = api.parseExport(exportText, { reasoning: false })
  A.equal(noThink.conversations[0].messages[1].reasoning, undefined, '关掉思考过程')
  A.throws(() => api.parseExport('{"foo": 1}', { reasoning: true }), /json/)
  A.throws(() => api.parseExport('not json', { reasoning: true }), /json/)
  // 英文界面下的附件说明是英文
  const en = load('en').api.parseExport(exportText, { reasoning: true })
  A.ok(en.conversations[0].messages[0].content.startsWith('[Attachment: notes.pdf]'))
}

// ── zip ──
{
  const { api } = load('zh')
  const data = Buffer.from(exportText)
  const deflated = zip([{ name: 'user.json', data: Buffer.from('{}') }, { name: 'deepseek_data/conversations.json', data }])
  A.equal(await api.readConversationsFromZip(deflated), exportText)
  const stored = zip([{ name: 'conversations.json', data, store: true }])
  A.equal(await api.readConversationsFromZip(stored), exportText)
  A.equal(await api.readConversationsFromZip(zip([{ name: 'other.json', data }])), null)
  // loadFile 走完整一遍(File 有 arrayBuffer)
  const { api: api2 } = load('zh', fakeTangu())
  await api2.loadFile(new File([deflated], 'deepseek.zip'))
  A.equal(api2.state.phase, 'ready')
  A.equal(api2.state.parsed.conversations.length, 3)
  await api2.loadFile(new File([Buffer.from('garbage')], 'x.json'))
  A.equal(api2.state.phase, 'error')
  A.equal(api2.state.error, '不是 DeepSeek 导出的 conversations.json。')
}

function fakeTangu(opts = {}) {
  const calls = { agents: [], imports: [] }
  return {
    calls,
    models: () => [{ id: 'gpt-x', name: 'GPT X' }, { id: 'deepseek-v4', name: 'DeepSeek V4' }],
    agents: () => [{ slug: 'muse', name: 'Muse' }],
    createAgent: async (input) => { calls.agents.push(input); return opts.agentFail ? { ok: false, error: 'boom' } : { ok: true, slug: 'deepseek' } },
    importSessions: async (input) => {
      calls.imports.push(input)
      input.onProgress?.(input.conversations.length, input.conversations.length)
      return {
        ok: true,
        results: input.conversations.map((c, i) => (i === 0 ? { id: c.id, status: 'exists', sessionId: 's-' + c.id } : i === 1 ? { id: c.id, status: 'created', sessionId: 's-' + c.id } : { id: c.id, status: 'error', error: 'too long' })),
      }
    },
    openSession: async (id) => { calls.opened = id },
  }
}

// ── 超长对话整段跳过并计数(不悄悄截掉),zip 解压按字节封顶 ──
{
  const { api } = load('zh')
  const long = [{ id: 'long', title: 'long', messages: Array.from({ length: 20001 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' })) }, exportJson[3]]
  const r = api.parseExport(JSON.stringify(long), { reasoning: true })
  A.equal(r.tooLong, 1)
  A.deepEqual(r.conversations.map((c) => c.id), ['conv-3'])
  const small = load('zh', undefined, src.replace('512 * 1024 * 1024', '1024')).api
  const bomb = zip([{ name: 'conversations.json', data: Buffer.alloc(200_000, 0x20) }])
  await A.rejects(() => small.readConversationsFromZip(bomb), /too-big/)
}

// ── 设置页 + 导入流程 ──
{
  const tangu = fakeTangu()
  const { api, settingsViews, commands, ctx, store } = load('zh', tangu)
  A.equal(settingsViews.length, 1)
  A.equal(commands.length, 1)
  commands[0].run()
  A.equal(ctx.opened, 'fplugin:deepseek-import')
  const handle = {}
  const dispose = settingsViews[0].mount(handle)
  A.equal(typeof dispose, 'function')
  let s = api.schema()
  A.equal(s.groups[0].items.find((i) => i.id === 'state').state.kind, 'empty', '装好是空的:先让人选文件')
  await api.loadFile(new File([exportText], 'conversations.json'))
  s = api.schema()
  A.equal(s.groups[0].items.find((i) => i.id === 'count').value, '3')
  A.equal(api.state.model, 'deepseek-v4', '模型缺省挑 DeepSeek')
  A.equal(s.groups[0].items.find((i) => i.id === 'agent').options[0].label, '新建「DeepSeek」')
  await api.runImport()
  A.equal(tangu.calls.agents.length, 1)
  A.equal(tangu.calls.agents[0].model, 'deepseek-v4')
  A.ok(!/[一-鿿]/.test(tangu.calls.agents[0].systemPrompt), '系统提示是英文')
  A.equal(tangu.calls.imports[0].agent, 'deepseek')
  A.equal(tangu.calls.imports[0].source, 'deepseek')
  A.equal(tangu.calls.imports[0].modelId, 'deepseek-v4')
  A.deepEqual(api.state.result, { ok: true, error: '', created: 1, existed: 1, failed: 1, firstError: 'too long', latest: 's-conv-2' })
  A.deepEqual(store.data, { agent: 'deepseek' }, '记住这次用的 Agent')
  s = api.schema()
  const open = s.groups[0].items.find((i) => i.id === 'open')
  await open.buttons[0].onClick()
  A.equal(tangu.calls.opened, 's-conv-2')
  // 第二次:已有的 Agent,不再新建
  await api.runImport()
  A.equal(tangu.calls.agents.length, 1)
  dispose()
}

// 建 Agent 失败:不往下导
{
  const tangu = fakeTangu({ agentFail: true })
  const { api } = load('en', tangu)
  await api.loadFile(new File([exportText], 'conversations.json'))
  await api.runImport()
  A.equal(tangu.calls.imports.length, 0)
  A.match(api.state.result.error, /Could not create the agent: boom/)
}

// 旧宿主(没有 agentImport):整页只给一句升级说明
{
  const { api } = load('zh', { models: () => [], agents: () => [] })
  A.equal(api.schema().state.title, '这个版本的 Forsion 还不支持导入')
}

// ── 双语 ──
{
  const m = src.match(/var MSG = (\{[\s\S]*?\n\})\n/)
  const MSG = new Function(`return ${m[1]}`)()
  A.deepEqual(Object.keys(MSG.zh).sort(), Object.keys(MSG.en).sort(), 'zh / en 键集一致')
  for (const [k, v] of Object.entries(MSG.en)) A.ok(!/[一-鿿]/.test(v), `en.${k} 含汉字`)
  for (const k of Object.keys(MSG.zh)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join()
    A.equal(ph(MSG.zh[k]), ph(MSG.en[k]), `${k} 占位符一致`)
  }
}

console.log('check ok')
