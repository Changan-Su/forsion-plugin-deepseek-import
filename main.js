/**
 * DeepSeek 记录导入 —— Forsion 插件(裸 setup(ctx) 体,宿主 new Function('ctx', code) 装载)。
 *
 * 一句话:选 DeepSeek 网页版导出的 zip(或里面的 conversations.json),新建一个「DeepSeek」Agent,
 * 把每段旧对话写成它名下**能接着聊**的会话。起因:2026-11-15 起 DeepSeek 网页版 / App 限额,
 * 超过 7 天没动的长对话不能再接着聊。
 *
 * 宿主契约(2026-11-16+,manifest 声明 "agentImport"):
 *   ctx.tangu.createAgent / ctx.tangu.importSessions —— 写进**本端**引擎(桌面本机、手机 / 网页云端,不跨端);
 *   会话追加不覆盖(同一段对话再导回 exists),保留原时间,不出未读点。
 * 界面:插件详情页(ctx.registerSettingsView + ctx.ui.mountSettingsPage,宿主自己的设置部件,手机上自动换排),
 *   外加一条命令直达这一页。不建 Space、不写笔记库;装好是空的。
 * 数据:导出文件只在本机内存里解析,不上传别处;只往本端引擎写会话。ctx.saveData 只记「上次用的 Agent」。
 *   存过却读不出来(宿主 2026-11-17 起 loadData reject,code = 'plugin-data-unreadable')时不写盘、提示一次,导入照常。
 * 解析器容错(DeepSeek 没有公开格式说明):mapping 树沿 current_node 往上走,没有就从根沿最后一个孩子往下走;
 *   片段 REQUEST → 用户、RESPONSE → 回答、THINK → 思考过程、FILE → 附件名,SEARCH / TOOL_* 只留一行说明;
 *   旧式 { role, content } 消息也认。时间:ISO 串或秒 / 毫秒数字都认。
 */
var PLUGIN_ID = 'deepseek-import'
var SOURCE = 'deepseek'
/** conversations.json 最多读这么大(解压后);再大的导出先在 DeepSeek 那边分批不现实,但几百 MB 的纯文本已远超常人用量 */
var MAX_JSON_BYTES = 512 * 1024 * 1024
/** 引擎一段对话最多收这么多条(sessionImport.ts IMPORT_MAX_MESSAGES);更长的整段跳过、单独计数,不悄悄截掉 */
var MAX_MESSAGES = 20000

var MSG = {
  zh: {
    cmdOpen: 'DeepSeek 记录导入:打开',
    groupTitle: '导入 DeepSeek 聊天记录',
    groupDesc: '把 DeepSeek 网页版导出的聊天记录变成一个 Agent:每段旧对话都是它名下的一个会话,点开就能接着聊。导进来的只在这台设备上;手机上要用,就在手机上再导一次。',
    howTitle: '先在 DeepSeek 导出',
    howDesc: '打开 DeepSeek 网页版 → 左下角头像 → 设置 → 数据管理 → 导出所有历史对话,下载得到一个 zip。直接选这个 zip,或者解压后选里面的 conversations.json。',
    pickTitle: '还没有选文件',
    pickDesc: '文件只在这台设备上读,不会上传到别处。',
    pick: '选择导出文件',
    repick: '换一个文件',
    reading: '正在读取文件…',
    readFailed: '读不了这个文件',
    noConversations: '文件里没有找到对话',
    zipUnsupported: '这台设备解不开 zip,请先解压,再选里面的 conversations.json。',
    notJson: '不是 DeepSeek 导出的 conversations.json。',
    fileRow: '文件',
    conversations: '对话',
    messages: '消息',
    range: '时间',
    skipped: '{n} 段没有内容,会跳过',
    tooLong: '{n} 段超过 {max} 条消息,太长了这次没法导入',
    tooBig: '文件太大(解压后超过 512 MB),读不了。',
    sep: ';',
    agentRow: '放进哪个 Agent',
    agentNew: '新建「DeepSeek」',
    modelRow: '用哪个模型接着聊',
    modelDesc: '新建的 Agent 缺省用它;导进来的会话也用它。',
    modelCurrent: '跟随当前会话',
    thinkRow: '带上思考过程',
    thinkDesc: 'DeepSeek 深度思考的内容放进每条回答的「思考」里。',
    goTitle: '开始导入',
    openTitle: '接着聊',
    start: '导入 {n} 段对话',
    importing: '正在导入',
    progress: '{done} / {total}',
    doneTitle: '导入完成',
    created: '新导入',
    existed: '之前导过(没动)',
    failed: '失败',
    failedDesc: '第一条原因:{error}',
    openLatest: '打开最近一段',
    importFailed: '导入没完成:{error}',
    retry: '再试一次',
    unavailableTitle: '这个版本的 Forsion 还不支持导入',
    unavailableDesc: '请升级 Forsion 后再试。',
    agentName: 'DeepSeek',
    agentDesc: '从 DeepSeek 网页版导入的对话',
    untitled: '未命名对话',
    fileNote: '[附件:{name}]',
    searchNote: '[这条回答用到了联网搜索,搜索结果没有导入]',
    agentCreateFailed: '建 Agent 失败:{error}',
    dataUnreadable: '读不出已保存的插件设置,「记住上次用的 Agent」先停用,也不会保存改动,原来的设置没有动。这次请自己选放进哪个 Agent,导入照常能用。',
    agentNotRemembered: '读不出上次用的 Agent,这次的选择不会记住。',
  },
  en: {
    cmdOpen: 'DeepSeek import: Open',
    groupTitle: 'Import DeepSeek chats',
    groupDesc: 'Turn the chats exported from DeepSeek on the web into an agent: each old chat becomes a session under it that you can open and continue. Imported chats stay on this device; to use them on your phone, import again there.',
    howTitle: 'Export from DeepSeek first',
    howDesc: 'Open DeepSeek on the web → your avatar at the bottom left → Settings → Data → Export all chats, and download the zip. Pick that zip here, or unzip it and pick conversations.json.',
    pickTitle: 'No file yet',
    pickDesc: 'The file is read on this device only and is not uploaded anywhere.',
    pick: 'Choose export file',
    repick: 'Choose another file',
    reading: 'Reading the file…',
    readFailed: 'This file could not be read',
    noConversations: 'No chats found in this file',
    zipUnsupported: 'This device cannot open zip files. Unzip it first and pick conversations.json.',
    notJson: 'This is not a conversations.json exported from DeepSeek.',
    fileRow: 'File',
    conversations: 'Chats',
    messages: 'Messages',
    range: 'Dates',
    skipped: '{n} empty chats will be skipped',
    tooLong: '{n} chats have more than {max} messages and are too long to import',
    tooBig: 'This file is too large to read (over 512 MB unzipped).',
    sep: '; ',
    agentRow: 'Agent',
    agentNew: 'New agent "DeepSeek"',
    modelRow: 'Model to continue with',
    modelDesc: 'The new agent uses it by default, and so do the imported sessions.',
    modelCurrent: 'Same as the current chat',
    thinkRow: 'Include reasoning',
    thinkDesc: 'DeepThink content goes into the reasoning of each reply.',
    goTitle: 'Start the import',
    openTitle: 'Continue chatting',
    start: 'Import {n} chats',
    importing: 'Importing',
    progress: '{done} / {total}',
    doneTitle: 'Import finished',
    created: 'Imported',
    existed: 'Already imported (unchanged)',
    failed: 'Failed',
    failedDesc: 'First reason: {error}',
    openLatest: 'Open the latest chat',
    importFailed: 'The import did not finish: {error}',
    retry: 'Try again',
    unavailableTitle: 'This version of Forsion cannot import yet',
    unavailableDesc: 'Update Forsion and try again.',
    agentName: 'DeepSeek',
    agentDesc: 'Chats imported from DeepSeek on the web',
    untitled: 'Untitled chat',
    fileNote: '[Attachment: {name}]',
    searchNote: '[This reply used web search; the search results were not imported]',
    agentCreateFailed: 'Could not create the agent: {error}',
    dataUnreadable: 'Your saved plugin settings could not be read. Remembering the last agent you used is paused and nothing will be saved, so the original settings are left as they were. Pick the agent yourself this time; importing still works.',
    agentNotRemembered: 'Your last agent could not be read, so this choice will not be remembered.',
  },
}

function localeNow() { try { return ctx.getLocale && ctx.getLocale() === 'en' ? 'en' : 'zh' } catch (e) { return 'zh' } }
var t = ctx.i18n && typeof ctx.i18n.define === 'function'
  ? ctx.i18n.define(MSG)
  : function (key, vars) {
    var s = MSG[localeNow()][key] || MSG.zh[key] || key
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])) })
    return s
  }

// 给模型读的,一律英文(见 CLAUDE.md「Tangu 提示词英文化」)
var AGENT_PROMPT = [
  'You are the user\'s DeepSeek assistant, moved into Forsion.',
  'The sessions under this agent were imported from the user\'s DeepSeek web history: earlier turns in a session are the original DeepSeek conversation, kept word for word.',
  'When the user continues one of them, pick up where it left off: keep the same language, tone and level of detail, and build on what was already said instead of starting over.',
  'You can search the user\'s past sessions when they refer to something discussed in another chat.',
].join('\n')
var AGENT_SOUL = 'Clear, direct and thorough, like the DeepSeek chats the user is used to. Answers in the language the user writes in.'

// ── 读文件 ─────────────────────────────────────────────────────────────────────

function readU16(b, o) { return b[o] | (b[o + 1] << 8) }
function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 }

/** 最小 zip 读取:按中央目录找 conversations.json(不分目录层级),stored / deflate 两种都认。返回文本或 null。 */
async function readConversationsFromZip(buf) {
  var b = new Uint8Array(buf)
  var eocd = -1
  for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (readU32(b, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip')
  var count = readU16(b, eocd + 10)
  var p = readU32(b, eocd + 16)
  var dec = new TextDecoder('utf-8')
  for (var n = 0; n < count; n++) {
    if (readU32(b, p) !== 0x02014b50) break
    var method = readU16(b, p + 10)
    var csize = readU32(b, p + 20)
    var nameLen = readU16(b, p + 28)
    var extraLen = readU16(b, p + 30)
    var commentLen = readU16(b, p + 32)
    var local = readU32(b, p + 42)
    var name = dec.decode(b.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/(^|\/)conversations\.json$/i.test(name)) continue
    var start = local + 30 + readU16(b, local + 26) + readU16(b, local + 28)
    var data = b.subarray(start, start + csize)
    if (method === 0) return dec.decode(data)
    if (method !== 8) throw new Error('zip-method')
    if (typeof DecompressionStream !== 'function') throw new Error('zip-unsupported')
    var ds
    try { ds = new DecompressionStream('deflate-raw') } catch (e) { throw new Error('zip-unsupported') }
    // 流式解压、按字节封顶:高压缩比的 zip 能把几十 KB 吹成几十 GB,整段 .text() 会撑爆渲染进程(Codex 11-16)
    var reader = new Blob([data]).stream().pipeThrough(ds).getReader()
    var td = new TextDecoder('utf-8')
    var parts = []
    var total = 0
    for (;;) {
      var step = await reader.read()
      if (step.done) break
      total += step.value.byteLength
      if (total > MAX_JSON_BYTES) { try { await reader.cancel() } catch (e) { /* ignore */ } throw new Error('too-big') }
      parts.push(td.decode(step.value, { stream: true }))
    }
    parts.push(td.decode())
    return parts.join('')
  }
  return null
}

function toMs(v) {
  if (v == null || v === '') return undefined
  if (typeof v === 'number' && isFinite(v)) return v < 1e12 ? Math.round(v * 1000) : Math.round(v)
  if (typeof v === 'string') {
    if (/^\d+(\.\d+)?$/.test(v)) return toMs(Number(v))
    var ms = Date.parse(v)
    return isFinite(ms) ? ms : undefined
  }
  return undefined
}
/** 引擎只收 2000 年之后、不晚于明天的毫秒时间;别的丢掉,交给引擎按前后顺序补 */
function okMs(ms) { return typeof ms === 'number' && ms >= 946684800000 && ms <= Date.now() + 86400000 ? ms : undefined }

function fragText(f) {
  if (!f) return ''
  if (typeof f.content === 'string') return f.content
  if (typeof f.text === 'string') return f.text
  return ''
}

/** 一个 mapping 节点的 message → { role, content, reasoning, timestamp, model } | null */
function messageOf(msg, opts) {
  if (!msg || typeof msg !== 'object') return null
  var role = null
  var content = []
  var reasoning = []
  var notes = []
  var frags = Array.isArray(msg.fragments) ? msg.fragments : null
  if (frags) {
    for (var i = 0; i < frags.length; i++) {
      var f = frags[i] || {}
      var type = String(f.type || '').toUpperCase()
      if (type === 'REQUEST') { role = 'user'; content.push(fragText(f)) }
      else if (type === 'RESPONSE') { role = role || 'assistant'; content.push(fragText(f)) }
      else if (type === 'THINK') { role = role || 'assistant'; reasoning.push(fragText(f)) }
      else if (type === 'FILE') {
        var fname = f.file_name || f.name || (f.file && f.file.name) || ''
        if (fname) notes.push(t('fileNote', { name: fname }))
      } else if (type === 'SEARCH' || type.indexOf('TOOL_') === 0) {
        if (notes.indexOf(t('searchNote')) < 0) notes.push(t('searchNote'))
      }
    }
  } else {
    var r = msg.role || (msg.author && msg.author.role)
    if (r === 'user' || r === 'assistant') role = r
    var c = msg.content
    if (typeof c === 'string') content.push(c)
    else if (c && Array.isArray(c.parts)) content.push(c.parts.filter(function (x) { return typeof x === 'string' }).join('\n'))
    if (typeof msg.reasoning_content === 'string') reasoning.push(msg.reasoning_content)
  }
  if (Array.isArray(msg.files)) {
    msg.files.forEach(function (file) {
      var nm = file && (file.file_name || file.name)
      if (nm && notes.indexOf(t('fileNote', { name: nm })) < 0) notes.push(t('fileNote', { name: nm }))
    })
  }
  if (!role) return null
  var body = content.join('\n\n').trim()
  if (notes.length) body = role === 'user' ? (notes.join('\n') + (body ? '\n\n' + body : '')) : ((body ? body + '\n\n' : '') + notes.join('\n'))
  if (!body) return null
  var out = { role: role, content: body }
  var rs = reasoning.join('\n\n').trim()
  if (rs && opts.reasoning && role === 'assistant') out.reasoning = rs
  var ts = okMs(toMs(msg.inserted_at != null ? msg.inserted_at : (msg.create_time != null ? msg.create_time : msg.created_at)))
  if (ts) out.timestamp = ts
  if (typeof msg.model === 'string' && msg.model && msg.model.length <= 128) out.model = msg.model
  return out
}

/** mapping 树 → 当前那一支的节点 id(从根到叶) */
function branchPath(mapping, currentNode) {
  var ids = Object.keys(mapping)
  var path = []
  var seen = {}
  if (currentNode && mapping[currentNode]) {
    var id = currentNode
    while (id && mapping[id] && !seen[id]) { seen[id] = 1; path.push(id); id = mapping[id].parent }
    return path.reverse()
  }
  var root = null
  for (var i = 0; i < ids.length; i++) {
    var node = mapping[ids[i]]
    if (!node || node.parent == null || !mapping[node.parent]) { root = ids[i]; break }
  }
  var cur = root
  while (cur && mapping[cur] && !seen[cur]) {
    seen[cur] = 1
    path.push(cur)
    var kids = Array.isArray(mapping[cur].children) ? mapping[cur].children : []
    cur = kids.length ? kids[kids.length - 1] : null
  }
  return path
}

/** conversations.json 文本 → { conversations: [...], skipped } */
function parseExport(text, opts) {
  var raw
  try { raw = JSON.parse(text) } catch (e) { throw new Error('json') }
  var list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.conversations) ? raw.conversations : null)
  if (!list) throw new Error('json')
  var out = []
  var skipped = 0
  var tooLong = 0
  var seenIds = {}
  for (var i = 0; i < list.length; i++) {
    var c = list[i]
    if (!c || typeof c !== 'object') { skipped++; continue }
    var id = String(c.id || c.conversation_id || c.chat_session_id || '')
    if (!id || id.length > 200 || seenIds[id]) { skipped++; continue }
    var messages = []
    if (c.mapping && typeof c.mapping === 'object') {
      var path = branchPath(c.mapping, c.current_node || c.current_message_id)
      for (var j = 0; j < path.length; j++) {
        var m = messageOf(c.mapping[path[j]] && c.mapping[path[j]].message, opts)
        if (m) messages.push(m)
      }
    } else if (Array.isArray(c.messages)) {
      for (var k = 0; k < c.messages.length; k++) { var mm = messageOf(c.messages[k], opts); if (mm) messages.push(mm) }
    }
    if (!messages.length) { skipped++; continue }
    if (messages.length > MAX_MESSAGES) { tooLong++; continue }
    seenIds[id] = 1
    var conv = { id: id, title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 200) : t('untitled'), messages: messages }
    var created = okMs(toMs(c.inserted_at != null ? c.inserted_at : (c.create_time != null ? c.create_time : c.created_at)))
    var updated = okMs(toMs(c.updated_at != null ? c.updated_at : c.update_time))
    if (created) conv.createdAt = created
    if (updated) conv.updatedAt = updated
    out.push(conv)
  }
  return { conversations: out, skipped: skipped, tooLong: tooLong }
}

async function parseFile(file, opts) {
  if (file.size > MAX_JSON_BYTES) throw new Error('too-big')
  var buf = await file.arrayBuffer()
  var head = new Uint8Array(buf.slice(0, 4))
  var text
  if (head[0] === 0x50 && head[1] === 0x4b) {
    text = await readConversationsFromZip(buf)
    if (text == null) throw new Error('json')
  } else {
    text = new TextDecoder('utf-8').decode(buf)
  }
  return parseExport(text, opts)
}

// ── 界面 ───────────────────────────────────────────────────────────────────────

var state = {
  phase: 'empty', // empty | reading | ready | importing | done | error
  fileName: '',
  file: null,
  parsed: null,
  error: '',
  agent: '', // '' = 新建
  model: '',
  reasoning: true,
  progress: { done: 0, total: 0 },
  result: null,
  savedUnreadable: false, // 上次读「上次用的 Agent」时存过却读不出来
}
var listeners = []
function redraw() { listeners.forEach(function (f) { try { f() } catch (e) { console.warn('[deepseek-import] redraw', e) } }) }

// 存过却读不出来(读错误 / 零字节 / 写到一半 / 被手改坏):宿主 2026-11-17 起 reject 这个 code。
// 这时按 {} 接着存,会把原来那份整个盖掉;所以只读不写、提示一次(每个插件实例一次),等下次再读。
// 没存过(null,旧宿主读不出来也是 null)和别的错照旧当空。
function isDataUnreadable(e) { return !!e && typeof e === 'object' && e.code === 'plugin-data-unreadable' }
var unreadableNoticed = false
function noticeUnreadable(e) {
  state.savedUnreadable = true
  if (unreadableNoticed) return
  unreadableNoticed = true
  console.warn('[deepseek-import] saved plugin data could not be read (' + (e && e.reason) + '); nothing will be saved')
  // 提示失败不能把「读不出来、不写」变成别的错
  try { if (typeof ctx.notify === 'function') ctx.notify(t('dataUnreadable'), { level: 'warning' }) } catch (err) { console.warn('[deepseek-import] notify', err) }
}
/** 存着的数据;存过却读不出来时抛 code = plugin-data-unreadable 的错(调用方别拿它当空再存) */
async function saved() {
  try { var v = ctx.loadData ? await ctx.loadData() : null; state.savedUnreadable = false; return v && typeof v === 'object' ? v : {} } catch (e) {
    if (isDataUnreadable(e)) { noticeUnreadable(e); throw e }
    return {}
  }
}
async function persist(patch) {
  try {
    var cur = await saved()
    // 读不出来之后、还没有哪次读成功过:这次就算是别的错(当空)也不写,免得盖掉那份读不出来的
    if (state.savedUnreadable) return
    var next = {}
    Object.keys(cur).forEach(function (k) { next[k] = cur[k] })
    Object.keys(patch).forEach(function (k) { next[k] = patch[k] })
    if (ctx.saveData) await ctx.saveData(next)
  } catch (e) { /* 只是记住上次的选择;读不出来时上面已经提示过,这里不写盘 */ }
}

function models() { try { return (ctx.tangu && ctx.tangu.models && ctx.tangu.models()) || [] } catch (e) { return [] } }
function agents() { try { return (ctx.tangu && ctx.tangu.agents && ctx.tangu.agents()) || [] } catch (e) { return [] } }
function defaultModel() {
  var ms = models()
  for (var i = 0; i < ms.length; i++) if (/deepseek/i.test(ms[i].id) || /deepseek/i.test(ms[i].name || '')) return ms[i].id
  return ''
}

function fmtDate(ms) {
  var d = new Date(ms)
  var p = function (n) { return n < 10 ? '0' + n : String(n) }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function pickFile() {
  var input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip,.json,application/zip,application/json'
  input.style.display = 'none'
  input.addEventListener('change', function () {
    var f = input.files && input.files[0]
    input.remove()
    if (f) void loadFile(f)
  })
  document.body.appendChild(input)
  input.click()
}

async function loadFile(f) {
  state.phase = 'reading'; state.fileName = f.name; state.file = f; state.error = ''; state.result = null
  redraw()
  try {
    var parsed = await parseFile(f, { reasoning: state.reasoning })
    if (!parsed.conversations.length) { state.phase = 'error'; state.error = t('noConversations') }
    else {
      state.parsed = parsed
      state.phase = 'ready'
      // 读不出上次用的 Agent:不预选、提示一次,导入照常(不算这个导出文件读不了)
      var last = ''
      try { last = (await saved()).agent } catch (e) { if (!isDataUnreadable(e)) throw e }
      state.agent = last && agents().some(function (a) { return a.slug === last }) ? last : ''
      if (!state.model) state.model = defaultModel()
    }
  } catch (e) {
    var code = String((e && e.message) || e)
    state.phase = 'error'
    state.error = code === 'too-big' ? t('tooBig') : code === 'zip-unsupported' ? t('zipUnsupported') : (code === 'json' || code === 'zip' || code === 'zip-method') ? t('notJson') : t('readFailed') + ':' + code
  }
  redraw()
}

async function reparseForReasoning() {
  if (!state.file) return
  try { state.parsed = await parseFile(state.file, { reasoning: state.reasoning }) } catch (e) { /* 上一次已经读通过 */ }
  redraw()
}

async function runImport() {
  var tg = ctx.tangu
  if (!tg || !tg.importSessions || !tg.createAgent || !state.parsed) return
  state.phase = 'importing'
  state.progress = { done: 0, total: state.parsed.conversations.length }
  redraw()
  try {
    var slug = state.agent
    if (!slug) {
      var a = await tg.createAgent({
        name: t('agentName'), nameEn: 'DeepSeek', description: t('agentDesc'),
        systemPrompt: AGENT_PROMPT, soul: AGENT_SOUL,
        model: state.model || undefined,
      })
      if (!a.ok) throw new Error(t('agentCreateFailed', { error: a.error }))
      slug = a.slug
      state.agent = slug
    }
    void persist({ agent: slug })
    var r = await tg.importSessions({
      agent: slug, source: SOURCE, conversations: state.parsed.conversations,
      modelId: state.model || undefined,
      onProgress: function (done, total) { state.progress = { done: done, total: total }; redraw() },
    })
    var created = [], existed = 0, failed = []
    ;(r.results || []).forEach(function (x) {
      if (x.status === 'created') created.push(x)
      else if (x.status === 'exists') existed++
      else failed.push(x)
    })
    var byId = {}
    state.parsed.conversations.forEach(function (c) { byId[c.id] = c.updatedAt || c.createdAt || 0 })
    var all = (r.results || []).filter(function (x) { return x.sessionId })
    all.sort(function (a, b) { return (byId[b.id] || 0) - (byId[a.id] || 0) })
    state.result = {
      ok: r.ok, error: r.ok ? '' : r.error,
      created: created.length, existed: existed, failed: failed.length,
      firstError: failed.length ? failed[0].error || '' : '',
      latest: all.length ? all[0].sessionId : null,
    }
    state.phase = 'done'
  } catch (e) {
    state.result = { ok: false, error: String((e && e.message) || e), created: 0, existed: 0, failed: 0, firstError: '', latest: null }
    state.phase = 'done'
  }
  redraw()
}

function schema() {
  var tg = ctx.tangu
  var groups = []
  if (!tg || typeof tg.importSessions !== 'function' || typeof tg.createAgent !== 'function') {
    return { state: { kind: 'empty', icon: 'info', title: t('unavailableTitle'), desc: t('unavailableDesc') } }
  }
  var items = [{ id: 'how', type: 'value', title: t('howTitle'), desc: t('howDesc'), value: '' }]
  if (state.phase === 'empty') {
    items.push({ id: 'state', type: 'state', state: { kind: 'empty', icon: 'download', title: t('pickTitle'), desc: t('pickDesc'), action: { label: t('pick'), kind: 'primary', onClick: pickFile } } })
  } else if (state.phase === 'reading') {
    items.push({ id: 'state', type: 'state', state: { kind: 'loading', title: t('reading'), desc: state.fileName } })
  } else if (state.phase === 'error') {
    items.push({ id: 'state', type: 'state', state: { kind: 'error', title: state.error, desc: state.fileName, action: { label: t('repick'), onClick: pickFile } } })
  } else {
    var p = state.parsed
    var nMsg = 0, lo = Infinity, hi = 0
    p.conversations.forEach(function (c) {
      nMsg += c.messages.length
      var a = c.createdAt || c.updatedAt, b = c.updatedAt || c.createdAt
      if (a && a < lo) lo = a
      if (b && b > hi) hi = b
    })
    items.push({ id: 'file', type: 'button', title: t('fileRow'), desc: state.fileName, buttons: [{ label: t('repick'), onClick: pickFile, disabled: state.phase === 'importing' }] })
    var notes = []
    if (p.skipped) notes.push(t('skipped', { n: p.skipped }))
    if (p.tooLong) notes.push(t('tooLong', { n: p.tooLong, max: MAX_MESSAGES }))
    items.push({ id: 'count', type: 'value', title: t('conversations'), desc: notes.length ? notes.join(t('sep')) : undefined, value: String(p.conversations.length) })
    items.push({ id: 'msgs', type: 'value', title: t('messages'), value: String(nMsg) })
    if (hi) items.push({ id: 'range', type: 'value', title: t('range'), value: fmtDate(lo === Infinity ? hi : lo) + ' – ' + fmtDate(hi) })
    if (state.phase === 'ready') {
      var agentOpts = [{ value: '', label: t('agentNew') }].concat(agents().map(function (a) { return { value: a.slug, label: a.name || a.slug } }))
      items.push({ id: 'agent', type: 'select', title: t('agentRow'), desc: state.savedUnreadable ? t('agentNotRemembered') : undefined, value: state.agent, options: agentOpts, onChange: function (v) { state.agent = v; redraw() } })
      var modelOpts = [{ value: '', label: t('modelCurrent') }].concat(models().map(function (m) { return { value: m.id, label: m.name || m.id } }))
      items.push({ id: 'model', type: 'select', title: t('modelRow'), desc: t('modelDesc'), value: state.model, options: modelOpts, onChange: function (v) { state.model = v; redraw() } })
      items.push({ id: 'think', type: 'switch', title: t('thinkRow'), desc: t('thinkDesc'), value: state.reasoning, onChange: function (v) { state.reasoning = v; return reparseForReasoning() } })
      items.push({ id: 'go', type: 'button', title: t('goTitle'), buttons: [{ label: t('start', { n: p.conversations.length }), kind: 'primary', onClick: runImport }] })
    } else if (state.phase === 'importing') {
      var pr = state.progress
      items.push({ id: 'meter', type: 'meters', meters: [{ label: t('importing'), value: pr.total ? pr.done / pr.total : 0, valueLabel: t('progress', { done: pr.done, total: pr.total }) }] })
    } else if (state.phase === 'done' && state.result) {
      var r = state.result
      if (r.error) items.push({ id: 'err', type: 'state', state: { kind: 'error', title: t('importFailed', { error: r.error }), action: { label: t('retry'), onClick: runImport } } })
      else items.push({ id: 'ok', type: 'value', title: t('doneTitle'), value: '' })
      items.push({ id: 'created', type: 'value', title: t('created'), value: String(r.created) })
      if (r.existed) items.push({ id: 'existed', type: 'value', title: t('existed'), value: String(r.existed) })
      if (r.failed) items.push({ id: 'failed', type: 'value', title: t('failed'), desc: r.firstError ? t('failedDesc', { error: r.firstError }) : undefined, value: String(r.failed) })
      if (state.savedUnreadable) items.push({ id: 'agentUnsaved', type: 'value', title: t('agentRow'), desc: t('agentNotRemembered'), value: '' })
      if (r.latest && tg.openSession) items.push({ id: 'open', type: 'button', title: t('openTitle'), buttons: [{ label: t('openLatest'), kind: 'primary', onClick: function () { return tg.openSession(r.latest) } }] })
    }
  }
  groups.push({ id: 'import', icon: 'download', title: t('groupTitle'), desc: t('groupDesc'), items: items })
  return { groups: groups }
}

if (typeof ctx.registerSettingsView === 'function') {
  ctx.registerSettingsView({
    id: 'import',
    keywords: 'deepseek import history chats 导入 聊天记录 历史 迁移 搬家',
    mount: function (el) {
      var handle = ctx.ui && typeof ctx.ui.mountSettingsPage === 'function' ? ctx.ui.mountSettingsPage(el, schema()) : null
      if (!handle) {
        el.textContent = t('unavailableTitle')
        return
      }
      var draw = function () { handle.update(schema()) }
      listeners.push(draw)
      var offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(draw) : null
      return function () {
        listeners = listeners.filter(function (f) { return f !== draw })
        if (offLocale) offLocale()
        handle.dispose()
      }
    },
  })
}

if (typeof ctx.registerCommand === 'function') {
  ctx.registerCommand({
    id: 'deepseek-import-open',
    title: function () { return t('cmdOpen') },
    keywords: 'deepseek import history chats agent 导入 聊天记录 历史 迁移 搬家',
    run: function () { if (ctx.app && ctx.app.openSettings) ctx.app.openSettings('fplugin:' + PLUGIN_ID) },
  })
}

// 自检用(check.mjs 经 ctx.__expose 拿纯函数;宿主不给这个键)
if (ctx.__expose) ctx.__expose({ parseExport: parseExport, readConversationsFromZip: readConversationsFromZip, branchPath: branchPath, schema: schema, state: state, runImport: runImport, loadFile: loadFile })
