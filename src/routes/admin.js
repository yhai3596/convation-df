// 管理后台：数据看板 / 内容管理 / 页面内容 / Agent 自动化 / 用户管理（仅 admin 角色）
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { marked } = require('marked');
const { db, getSetting, setSetting } = require('../db');
const analytics = require('../analytics');
const agent = require('../agent');
const mailer = require('../mailer');
const llm = require('../llm');
const config = require('../config');
const content = require('../content');
const report = require('../report');
const worker = require('../worker');

const router = express.Router();

function requireAdmin(req, res, next) {
  const u = req.session.user;
  if (!u) return res.redirect('/login?next=/admin');
  if (u.role !== 'admin') return res.status(403).render('404', { title: '无权访问', active: '', message: '该页面仅管理员可见。' });
  next();
}
function requireAdminApi(req, res, next) {
  const u = req.session.user;
  if (!u || u.role !== 'admin') return res.status(403).json({ error: '仅管理员可操作' });
  next();
}

// ============================================================ 后台主页
router.get('/admin', requireAdmin, (req, res) => {
  const range = ['7', '30', 'all'].includes(req.query.range) ? req.query.range : '30';
  const days = range === 'all' ? 0 : Number(range);
  const dash = analytics.dashboard(days);

  const posts = db.prepare('SELECT * FROM posts ORDER BY COALESCE(published_at, updated_at) DESC').all();
  const courses = db.prepare('SELECT * FROM courses ORDER BY no').all();
  const tools = db.prepare('SELECT * FROM tools ORDER BY no').all();
  const cases = db.prepare('SELECT * FROM cases ORDER BY sort').all();
  const users = analytics.usersList();
  const submissions = db.prepare('SELECT * FROM diagnosis_submissions ORDER BY created_at DESC LIMIT 20').all();
  const counts = {
    subscribers: db.prepare('SELECT COUNT(*) c FROM subscribers').get().c,
    messages: db.prepare('SELECT COUNT(*) c FROM messages').get().c,
    submissions: db.prepare('SELECT COUNT(*) c FROM diagnosis_submissions').get().c,
  };
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 10').all();

  const llmCfg = config.llmConfig();
  res.render('admin', {
    title: '管理后台 · Alan',
    active: '',
    range, dash,
    pvPoints: analytics.trendPoints(dash.trend, 'pv'),
    uvPoints: analytics.trendPoints(dash.trend, 'uv'),
    posts, courses, tools, cases, users, submissions, messages, counts,
    agentStatus: agent.agentStatus(),
    mailerEnabled: mailer.enabled(),
    llmEnabled: llm.enabled(),
    // Agent 自动化中心
    queue: worker.queueStats(),
    activity: config.recentActivity(30),
    tokens: db.prepare('SELECT id,name,revoked,last_used_at,created_at FROM api_tokens ORDER BY id DESC').all(),
    drafts: posts.filter(p => p.status === 'draft'),
    llmCfgView: { base: llmCfg.base, model: llmCfg.model, keyMasked: config.maskKey(llmCfg.key), configured: !!llmCfg.key },
    llmProviders: config.llmProvidersView(),
    workerLastTick: getSetting('worker_last_tick', null),
    // 页面内容 / 诊断知识库
    contentList: content.listForAdmin(),
    kb: report.getKB(),
    kbOverridden: !!getSetting('diagnosis_kb'),
  });
});

// 草稿预览（后台专用）
router.get('/admin/preview/post/:id', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id));
  if (!post) return res.status(404).render('404', { title: '不存在', active: '' });
  res.render('article', {
    title: `[预览] ${post.title}`,
    active: 'AI资讯',
    post,
    contentHtml: marked.parse(post.content_md || ''),
    comments: [],
    commentCount: 0,
    preview: true,
  });
});

// ============================================================ 内容 CRUD
router.post('/admin/api/post', requireAdminApi, (req, res) => {
  const { id, title = '', category = '行业观察', excerpt = '', content_md = '', read_minutes = 5, status = 'draft' } = req.body || {};
  const t = String(title).trim();
  if (!t) return res.status(400).json({ error: '请填写标题' });
  const st = ['published', 'draft', 'archived'].includes(status) ? status : 'draft';
  const rm = Math.max(1, Math.min(120, Number(read_minutes) || 5));

  if (id) {
    const old = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(id));
    if (!old) return res.status(404).json({ error: '文章不存在' });
    const publishedAt = old.published_at || (st === 'published' ? db.prepare("SELECT date('now','+8 hours') d").get().d : null);
    db.prepare(`UPDATE posts SET title=?, category=?, excerpt=?, content_md=?, read_minutes=?, status=?, published_at=?, updated_at=datetime('now') WHERE id=?`)
      .run(t, String(category).trim() || '行业观察', String(excerpt).trim(), String(content_md), rm, st, publishedAt, old.id);
    return res.json({ ok: true, id: old.id });
  }
  const slug = `post-${Date.now().toString(36)}`;
  const publishedAt = st === 'published' ? db.prepare("SELECT date('now','+8 hours') d").get().d : null;
  const r = db.prepare(`INSERT INTO posts(slug,title,category,excerpt,content_md,read_minutes,status,published_at,created_by)
    VALUES (?,?,?,?,?,?,?,?,'admin')`)
    .run(slug, t, String(category).trim() || '行业观察', String(excerpt).trim(), String(content_md), rm, st, publishedAt);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 一键发布（草稿审核通过）
router.post('/admin/api/post-publish', requireAdminApi, (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(Number((req.body || {}).id));
  if (!p) return res.status(404).json({ error: '文章不存在' });
  const publishedAt = p.published_at || db.prepare("SELECT date('now','+8 hours') d").get().d;
  db.prepare(`UPDATE posts SET status='published', published_at=?, updated_at=datetime('now') WHERE id=?`).run(publishedAt, p.id);
  config.logActivity('admin', 'post_publish', `post#${p.id}`, p.title.slice(0, 50), true);
  res.json({ ok: true });
});

// AI 生成文章草稿（需 LLM 配置）
router.post('/admin/api/post-generate', requireAdminApi, async (req, res) => {
  if (!llm.enabled()) return res.status(400).json({ error: '尚未配置 LLM——请先在「Agent 自动化」页填写 API Key 并测试连接' });
  const { topic = '', outline = '', style = '行业观察，克制专业', length = '800' } = req.body || {};
  const tp = String(topic).trim();
  if (!tp) return res.status(400).json({ error: '请填写选题' });
  try {
    const text = await llm.chat([
      { role: 'system', content: `你是 Alan（暖通行业 AI 专家，20 多年制造业经验）的写作助理「小龙虾」。${agent.SITE_KNOWLEDGE}\n为 Alan 的博客撰写文章草稿。要求：中文、面向制造业/暖通从业者、观点务实不夸大、可用二级标题分段（Markdown ## ）。只输出 JSON：{"title":"标题","category":"行业观察|工具方法|专利|课程笔记 之一","excerpt":"60-90字摘要","content_md":"Markdown 正文","read_minutes":整数}` },
      { role: 'user', content: `选题：${tp}\n要点/大纲：${String(outline).trim() || '（自拟）'}\n风格：${String(style).trim()}\n目标篇幅：约 ${Number(length) || 800} 字` },
    ], { maxTokens: 3000, timeoutMs: 60000, json: true });
    const j = llm.parseJson(text);
    if (!j.title || !j.content_md) throw new Error('生成结果缺少标题或正文');
    const slug = `post-${Date.now().toString(36)}`;
    const rm = Math.max(1, Math.min(60, Number(j.read_minutes) || Math.round(String(j.content_md).length / 400) || 5));
    const cat = ['行业观察', '工具方法', '专利', '课程笔记'].includes(j.category) ? j.category : '行业观察';
    const r = db.prepare(`INSERT INTO posts(slug,title,category,excerpt,content_md,read_minutes,status,created_by)
      VALUES (?,?,?,?,?,?,'draft','ai')`)
      .run(slug, String(j.title).slice(0, 120), cat, String(j.excerpt || '').slice(0, 300), String(j.content_md), rm);
    config.logActivity('system:ai', 'post_create', `post#${r.lastInsertRowid}`, `AI 草稿：${String(j.title).slice(0, 50)}`, true);
    res.json({ ok: true, id: r.lastInsertRowid, title: j.title, status: 'draft' });
  } catch (e) {
    config.logActivity('system:ai', 'post_create', '', `生成失败：${e.message}`, false);
    res.status(500).json({ error: `生成失败：${e.message}` });
  }
});

router.post('/admin/api/course', requireAdminApi, (req, res) => {
  const { id, title = '', description = '', lectures, price_yuan, status = 'live', tag = '', kicker = '', cover_url = '' } = req.body || {};
  const t = String(title).trim();
  if (!t) return res.status(400).json({ error: '请填写课程名称' });
  const st = ['live', 'coming'].includes(status) ? status : 'live';
  const lec = lectures ? Math.max(1, Number(lectures)) : null;
  const price = price_yuan !== '' && price_yuan != null ? Math.round(Number(price_yuan) * 100) : null;
  const kick = String(kicker).trim() || (st === 'live' ? `已上线${lec ? ` · ${lec} 讲` : ''}` : '筹备中');
  const cover = /^\/uploads\/[\w\-./]+$/.test(String(cover_url)) ? String(cover_url) : '';

  if (id) {
    const old = db.prepare('SELECT id FROM courses WHERE id=?').get(Number(id));
    if (!old) return res.status(404).json({ error: '课程不存在' });
    db.prepare(`UPDATE courses SET title=?, description=?, lectures=?, price_cents=?, status=?, tag=?, kicker=?, cover_url=?, updated_at=datetime('now') WHERE id=?`)
      .run(t, String(description).trim(), lec, price, st, String(tag).trim(), kick, cover, old.id);
    return res.json({ ok: true, id: old.id });
  }
  const no = (db.prepare('SELECT MAX(no) m FROM courses').get().m || 0) + 1;
  const r = db.prepare('INSERT INTO courses(no,title,description,lectures,price_cents,status,tag,kicker,cover_url) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(no, t, String(description).trim(), lec, price, st, String(tag).trim(), kick, cover);
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.post('/admin/api/tool', requireAdminApi, (req, res) => {
  const { id, name = '', description = '', status = 'live', url = '' } = req.body || {};
  const t = String(name).trim();
  if (!t) return res.status(400).json({ error: '请填写工具名称' });
  const st = ['live', 'coming'].includes(status) ? status : 'live';
  const u = String(url).trim();
  if (u && !/^https?:\/\//.test(u)) return res.status(400).json({ error: '工具链接需以 http(s):// 开头' });

  if (id) {
    const old = db.prepare('SELECT id FROM tools WHERE id=?').get(Number(id));
    if (!old) return res.status(404).json({ error: '工具不存在' });
    db.prepare(`UPDATE tools SET name=?, description=?, status=?, url=?, updated_at=datetime('now') WHERE id=?`)
      .run(t, String(description).trim(), st, u, old.id);
    return res.json({ ok: true, id: old.id });
  }
  const no = (db.prepare('SELECT MAX(no) m FROM tools').get().m || 0) + 1;
  const r = db.prepare('INSERT INTO tools(no,name,description,status,url) VALUES (?,?,?,?,?)')
    .run(no, t, String(description).trim(), st, u);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 案例 CRUD
router.post('/admin/api/case', requireAdminApi, (req, res) => {
  const { id, org = '', title = '', description = '', metric_value = '', metric_label = '', sort } = req.body || {};
  const t = String(title).trim();
  const o = String(org).trim();
  if (!o || !t) return res.status(400).json({ error: '请填写客户描述与案例标题' });

  if (id) {
    const old = db.prepare('SELECT id, sort FROM cases WHERE id=?').get(Number(id));
    if (!old) return res.status(404).json({ error: '案例不存在' });
    db.prepare('UPDATE cases SET org=?, title=?, description=?, metric_value=?, metric_label=?, sort=? WHERE id=?')
      .run(o, t, String(description).trim(), String(metric_value).trim(), String(metric_label).trim(),
        sort !== undefined && sort !== '' ? Number(sort) : old.sort, old.id);
    return res.json({ ok: true, id: old.id });
  }
  const nextSort = (db.prepare('SELECT MAX(sort) m FROM cases').get().m || 0) + 1;
  const r = db.prepare('INSERT INTO cases(org,title,description,metric_value,metric_label,sort) VALUES (?,?,?,?,?,?)')
    .run(o, t, String(description).trim(), String(metric_value).trim(), String(metric_label).trim(),
      sort !== undefined && sort !== '' ? Number(sort) : nextSort);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// 可归档实体（文章走 posts.status，不在此表）
const ENTITY_TABLES = { course: 'courses', tool: 'tools', case: 'cases' };

// 删除：四类统一两段式——首次=归档下线（前台隐藏、可恢复），归档态再删=彻底移除（文章评论级联）
router.post('/admin/api/delete', requireAdminApi, (req, res) => {
  const { type, id } = req.body || {};
  const n = Number(id);
  if (type === 'post') {
    const p = db.prepare('SELECT id,title,status FROM posts WHERE id=?').get(n);
    if (!p) return res.status(404).json({ error: '文章不存在' });
    if (p.status !== 'archived') {
      db.prepare(`UPDATE posts SET status='archived', updated_at=datetime('now') WHERE id=?`).run(n);
      config.logActivity('admin', 'post_archive', `post#${n}`, p.title.slice(0, 50), true);
      return res.json({ ok: true, archived: true, note: '已归档下线（再次删除将彻底移除，含评论）' });
    }
    db.prepare('DELETE FROM posts WHERE id=?').run(n); // comments ON DELETE CASCADE
    config.logActivity('admin', 'post_delete', `post#${n}`, p.title.slice(0, 50), true);
    return res.json({ ok: true, deleted: true });
  }
  const table = ENTITY_TABLES[type];
  if (!table) return res.status(400).json({ error: '未知类型' });
  const row = db.prepare(`SELECT id, archived FROM ${table} WHERE id=?`).get(n);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  if (!row.archived) {
    db.prepare(`UPDATE ${table} SET archived=1 WHERE id=?`).run(n);
    config.logActivity('admin', `${type}_archive`, `${type}#${n}`, '', true);
    return res.json({ ok: true, archived: true, note: '已归档下线（前台已隐藏，可恢复；再次删除将彻底移除）' });
  }
  db.prepare(`DELETE FROM ${table} WHERE id=?`).run(n);
  config.logActivity('admin', `${type}_delete`, `${type}#${n}`, '', true);
  res.json({ ok: true, deleted: true });
});

// 恢复归档：课程/工具/案例（文章走 post-publish 复位状态）
router.post('/admin/api/restore', requireAdminApi, (req, res) => {
  const { type, id } = req.body || {};
  const table = ENTITY_TABLES[type];
  if (!table) return res.status(400).json({ error: '未知类型' });
  const n = Number(id);
  const r = db.prepare(`UPDATE ${table} SET archived=0 WHERE id=?`).run(n);
  if (!r.changes) return res.status(404).json({ error: '记录不存在' });
  config.logActivity('admin', `${type}_restore`, `${type}#${n}`, '', true);
  res.json({ ok: true });
});

// ============================================================ Agent 自动化配置
router.post('/admin/api/agent', requireAdminApi, (req, res) => {
  const { autoreply, contentReview, scanIntervalMin } = req.body || {};
  config.saveAgentModes({ autoreply, contentReview, scanIntervalMin });
  config.logActivity('admin', 'modes_save', '',
    `自动回复=${config.agentModes().autoreply ? '开' : '关'} 审核制=${config.agentModes().contentReview ? '开' : '关'} 巡检=${config.agentModes().scanIntervalMin}min`, true);
  res.json({ ok: true, modes: config.agentModes() });
});

// 新增/更新一个 LLM provider（key 传空=保留原 key）
router.post('/admin/api/llm-provider', requireAdminApi, (req, res) => {
  const { id, name, base, model, key, enabled } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: '请给这个 LLM 起个名字' });
  if (!String(base || '').trim() || !String(model || '').trim()) return res.status(400).json({ error: 'Base URL 和模型必填' });
  try {
    config.saveProvider({ id, name, base, model, key, enabled });
    config.logActivity('admin', 'llm_provider_save', String(name), `${model} @ ${base}`, true);
    res.json({ ok: true, providers: config.llmProvidersView() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/admin/api/llm-provider-delete', requireAdminApi, (req, res) => {
  config.deleteProvider(String((req.body || {}).id));
  config.logActivity('admin', 'llm_provider_delete', String((req.body || {}).id), '', true);
  res.json({ ok: true, providers: config.llmProvidersView() });
});

router.post('/admin/api/llm-provider-toggle', requireAdminApi, (req, res) => {
  config.toggleProvider(String((req.body || {}).id), !!(req.body || {}).enabled);
  res.json({ ok: true, providers: config.llmProvidersView() });
});

router.post('/admin/api/llm-provider-order', requireAdminApi, (req, res) => {
  const ids = (req.body || {}).ids;
  if (Array.isArray(ids)) { config.reorderProviders(ids.map(String)); config.logActivity('admin', 'llm_provider_order', '', ids.length + ' 项', true); }
  res.json({ ok: true, providers: config.llmProvidersView() });
});

// 测试连接：带 {id} 测已存 provider；或带 {base,model,key} 测临时输入
router.post('/admin/api/llm-test', requireAdminApi, async (req, res) => {
  const { id, base, model, key } = req.body || {};
  let override = null;
  if (id) {
    const p = config.llmProviders().find(x => x.id === id);
    if (p) override = { name: p.name, base: p.base, model: p.model, key: p.key };
  } else if (base && model && key) {
    override = { name: '临时测试', base: String(base).replace(/\/$/, ''), model: model, key: key };
  }
  const r = await llm.testConnection(override);
  config.logActivity('admin', 'llm_test', r.name || '', r.ok ? `${r.model} ${r.latencyMs}ms` : `失败：${r.error}`, r.ok);
  res.json(r);
});

// 令牌管理：创建（明文只返回一次）/吊销
router.post('/admin/api/token', requireAdminApi, (req, res) => {
  const name = String((req.body || {}).name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: '请给令牌起个名字（如 小龙虾 / hermes）' });
  const token = 'alan_' + crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const r = db.prepare('INSERT INTO api_tokens(name, token_hash) VALUES (?,?)').run(name, hash);
  config.logActivity('admin', 'token_create', `token#${r.lastInsertRowid}`, name, true);
  res.json({ ok: true, id: r.lastInsertRowid, name, token, note: '令牌只显示这一次，请立即保存' });
});

router.post('/admin/api/token-revoke', requireAdminApi, (req, res) => {
  const r = db.prepare('UPDATE api_tokens SET revoked=1 WHERE id=?').run(Number((req.body || {}).id));
  if (!r.changes) return res.status(404).json({ error: '令牌不存在' });
  config.logActivity('admin', 'token_revoke', `token#${(req.body || {}).id}`, '', true);
  res.json({ ok: true });
});

// ============================================================ 页面内容 / 诊断知识库
router.post('/admin/api/content', requireAdminApi, (req, res) => {
  const { key, value } = req.body || {};
  try {
    content.save(String(key), value == null ? '' : String(value));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/admin/api/kb', requireAdminApi, (req, res) => {
  const { spotLibrary, foundationNotes, stageTemplates, summaryTemplate } = req.body || {};
  try {
    const kb = {};
    if (spotLibrary && typeof spotLibrary === 'object') {
      kb.spotLibrary = {};
      for (const [domain, items] of Object.entries(spotLibrary)) {
        const arr = Array.isArray(items) ? items.map(s => String(s).trim()).filter(Boolean) : [];
        if (arr.length < 5) return res.status(400).json({ error: `「${domain}」至少需要 5 条结合点（当前 ${arr.length} 条）` });
        kb.spotLibrary[domain] = arr;
      }
    }
    if (Array.isArray(foundationNotes)) {
      const arr = foundationNotes.map(s => String(s).trim());
      if (arr.length !== 4 || arr.some(s => !s)) return res.status(400).json({ error: '基础评语需 4 条且不能为空（对应问卷第 1 题四个选项）' });
      kb.foundationNotes = arr;
    }
    if (Array.isArray(stageTemplates)) {
      if (stageTemplates.length !== 3 || stageTemplates.some(s => !s.name || !s.window || !s.desc)) {
        return res.status(400).json({ error: '阶段模板需 3 条且名称/时间窗/说明齐全' });
      }
      kb.stageTemplates = stageTemplates.map(s => ({ name: String(s.name), window: String(s.window), desc: String(s.desc) }));
    }
    if (summaryTemplate !== undefined) {
      if (!String(summaryTemplate).includes('{focus}')) return res.status(400).json({ error: '摘要模板必须包含 {focus} 占位符' });
      kb.summaryTemplate = String(summaryTemplate);
    }
    setSetting('diagnosis_kb', JSON.stringify(kb));
    config.logActivity('admin', 'kb_save', '', '诊断知识库已更新', true);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/admin/api/kb-reset', requireAdminApi, (req, res) => {
  db.prepare("DELETE FROM settings WHERE key='diagnosis_kb'").run();
  config.logActivity('admin', 'kb_reset', '', '诊断知识库恢复默认', true);
  res.json({ ok: true });
});

// ============================================================ 图片上传
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const IMG_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

router.post('/admin/api/upload', requireAdminApi, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  const ext = IMG_TYPES[req.file.mimetype];
  if (!ext) return res.status(400).json({ error: '仅支持 JPG / PNG / WebP 图片' });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.file.buffer);
  res.json({ ok: true, url: `/uploads/${name}` });
});

module.exports = router;
