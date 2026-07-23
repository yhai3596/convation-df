// JSON API：认证 / 诊断 / 评论 / 助手 / 订阅留言 / 埋点
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const report = require('../report');
const agent = require('../agent');
const mailer = require('../mailer');
const analytics = require('../analytics');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// —— 简易限流 ——
const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}|${req.ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
    if (++b.n > max) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche istante.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 600e3).unref();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Accedi per continuare' });
  next();
}

// —— 认证 ——
router.post('/auth/register', rateLimit('reg', 10, 600e3), (req, res) => {
  const { name = '', email = '', password = '', agree = false, sid = '', lang = 'it' } = req.body || {};
  const err = (it, en) => res.status(400).json({ error: lang === 'en' ? en : it });
  const n = String(name).trim();
  const em = String(email).trim().toLowerCase();
  if (!n || n.length > 40) return err('Inserisci il tuo nome', 'Please enter your name');
  if (!EMAIL_RE.test(em)) return err('Inserisci un indirizzo email valido', 'Please enter a valid email');
  if (String(password).length < 8) return err('La password deve avere almeno 8 caratteri', 'Password must be at least 8 characters');
  if (!agree) return err('Devi accettare i termini di servizio e la privacy policy', 'Please accept the terms of service and privacy policy');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(em)) return res.status(409).json({ error: lang === 'en' ? 'Email already registered. Please sign in.' : 'Email già registrata. Accedi con le tue credenziali.' });

  const source = analytics.firstTouchSource(String(sid));
  const r = db.prepare("INSERT INTO users(email,name,password_hash,role,source) VALUES (?,?,?,'member',?)")
    .run(em, n, bcrypt.hashSync(String(password), 10), source);
  req.session.user = { id: r.lastInsertRowid, name: n, email: em, role: 'member' };
  analytics.record({ sid, userId: r.lastInsertRowid, type: 'register', path: '/login' });
  res.json({ ok: true, user: { name: n, role: 'member' } });
});

router.post('/auth/login', rateLimit('login', 15, 600e3), (req, res) => {
  const { email = '', password = '', sid = '', lang = 'it' } = req.body || {};
  const em = String(email).trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(em);
  if (!u || !bcrypt.compareSync(String(password), u.password_hash)) {
    return res.status(401).json({ error: lang === 'en' ? 'Wrong email or password' : 'Email o password non corretti' });
  }
  req.session.user = { id: u.id, name: u.name, email: u.email, role: u.role };
  analytics.record({ sid, userId: u.id, type: 'login', path: '/login' });
  res.json({ ok: true, user: { name: u.name, role: u.role } });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// —— 企业 AI 诊断 ——
router.post('/diagnosis', rateLimit('diag', 10, 600e3), async (req, res) => {
  const { answers, company = '', email = '', sid = '' } = req.body || {};
  if (!Array.isArray(answers) || answers.length !== report.QUESTIONS.length ||
      answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= report.QUESTIONS[i].options.length)) {
    return res.status(400).json({ error: 'Risposte del questionario incomplete' });
  }
  const comp = String(company).trim().slice(0, 80);
  const em = String(email).trim().toLowerCase();
  if (!comp) return res.status(400).json({ error: "Inserisci il nome dell'azienda" });
  if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'Inserisci un indirizzo email di lavoro valido' });

  const { report: rep, generator } = await report.generate(answers, comp);
  const emailed = await mailer.sendDiagnosisReport(em, comp, rep) ? 1 : 0;

  db.prepare(`INSERT INTO diagnosis_submissions(company,email,answers_json,level,spots,summary,report_json,generator,emailed)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(comp, em, JSON.stringify(answers), rep.level, rep.spots, rep.summary, JSON.stringify(rep), generator, emailed);
  analytics.record({ sid, userId: req.session.user ? req.session.user.id : null, type: 'diagnosis_submit', path: '/diagnosis' });

  res.json({
    ok: true,
    level: rep.level, levelDesc: rep.levelDesc, spots: rep.spots,
    stages: rep.stages, integrationPoints: rep.integrationPoints,
    summary: rep.summary, emailed: !!emailed, generator,
  });
});

// —— 评论（登录后）+ Agent 自动回复 ——
router.post('/comments', rateLimit('comment', 12, 600e3), requireLogin, async (req, res) => {
  const { post_id, body = '' } = req.body || {};
  const post = db.prepare("SELECT id, lang FROM posts WHERE id=? AND status='published'").get(Number(post_id));
  if (!post) return res.status(404).json({ error: 'Articolo non trovato' });
  const text = String(body).trim();
  if (text.length < 2 || text.length > 1000) return res.status(400).json({ error: post.lang === 'en' ? 'Comments must be between 2 and 1000 characters' : 'Il commento deve essere tra 2 e 1000 caratteri' });

  const u = req.session.user;
  const r = db.prepare("INSERT INTO comments(post_id,user_id,author_name,body,agent_status) VALUES (?,?,?,?,'pending')")
    .run(post.id, u.id, u.name, text);
  const comment = db.prepare('SELECT * FROM comments WHERE id=?').get(r.lastInsertRowid);

  // 立即返回（不阻塞）；Agent 自动回复在后台异步进行，前端轮询 /reply-status 获取。
  // 失败/超时保持 pending，站内 Worker 会自动补处理。
  res.json({ ok: true, comment });
  Promise.resolve()
    .then(() => agent.commentAutoReply(post.id, comment.id, text, 'system:即时'))
    .catch(e => console.warn('[agent] 自动回复失败（Worker 将补处理）：', e.message));
});

// 评论的 Agent 回复状态（前端发表后轮询）
router.get('/comments/:id/reply-status', (req, res) => {
  const id = Number(req.params.id);
  const parent = db.prepare('SELECT id, agent_status FROM comments WHERE id=? AND parent_id IS NULL AND is_agent=0').get(id);
  if (!parent) return res.status(404).json({ error: 'Commento non trovato' });
  const reply = db.prepare('SELECT author_name, body, agent_label, created_at, is_agent FROM comments WHERE parent_id=? ORDER BY id LIMIT 1').get(id);
  res.json({ ok: true, status: parent.agent_status || 'pending', reply: reply || null });
});

// —— 悬浮智能助手 ——
router.post('/assistant', rateLimit('assist', 30, 600e3), async (req, res) => {
  const msg = String((req.body || {}).message || '').trim().slice(0, 500);
  const path = String((req.body || {}).path || '');
  const lang = path === '/en' || path.startsWith('/en/') ? 'en' : 'it'; // 回复语言随访客所在语言版
  if (!msg) return res.status(400).json({ error: lang === 'en' ? 'Please write a message' : 'Scrivi un messaggio' });
  analytics.record({ sid: (req.body || {}).sid || '', type: 'assistant_msg', path });
  const { reply, via } = await agent.assistantReply(msg, lang);
  res.json({ ok: true, reply, via });
});

// —— 订阅 / 留言 / 课程意向 ——
router.post('/subscribe', rateLimit('sub', 10, 600e3), (req, res) => {
  const em = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return res.status(400).json({ error: 'Inserisci un indirizzo email valido' });
  db.prepare('INSERT OR IGNORE INTO subscribers(email) VALUES (?)').run(em);
  res.json({ ok: true });
});

router.post('/message', rateLimit('msg', 10, 600e3), (req, res) => {
  const { name = '', email = '', body = '' } = req.body || {};
  const text = String(body).trim();
  if (text.length < 2 || text.length > 2000) return res.status(400).json({ error: 'Scrivi il tuo messaggio' });
  db.prepare('INSERT INTO messages(name,email,body) VALUES (?,?,?)')
    .run(String(name).trim().slice(0, 40), String(email).trim().slice(0, 80), text);
  res.json({ ok: true });
});

// —— 询价 / 报修 / 联系（Convation 前台三表单，独立入库 + 可选 SMTP 提醒） ——
const INQUIRY_KINDS = ['preventivo', 'riparazione', 'contatto'];
router.post('/inquiry', rateLimit('inq', 10, 600e3), (req, res) => {
  const { kind = '', name = '', email = '', phone = '', topic = '', body = '', lang = 'it' } = req.body || {};
  const lg = lang === 'en' ? 'en' : 'it';
  const err = (it, en) => res.status(400).json({ error: lg === 'en' ? en : it });
  if (!INQUIRY_KINDS.includes(kind)) return err('Richiesta non valida', 'Invalid request');
  const n = String(name).trim();
  if (!n || n.length > 40) return err('Inserisci il tuo nome', 'Please enter your name');
  const em = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(em)) return err('Inserisci un indirizzo email valido', 'Please enter a valid email');
  const text = String(body).trim();
  if (text.length < 2 || text.length > 2000) return err('Scrivi qualche dettaglio in più', 'Please add a few more details');
  const inq = { kind, name: n, email: em, phone: String(phone).trim().slice(0, 30), topic: String(topic).trim().slice(0, 60), body: text, lang: lg };
  const r = db.prepare('INSERT INTO inquiries(kind,name,email,phone,topic,body,lang) VALUES (?,?,?,?,?,?,?)')
    .run(inq.kind, inq.name, inq.email, inq.phone, inq.topic, inq.body, inq.lang);
  res.json({ ok: true, id: r.lastInsertRowid });
  // 邮件提醒不阻塞响应；SMTP/收件箱未配置时静默跳过，失败仅告警（记录已入库）
  Promise.resolve().then(() => mailer.notifyInquiry(inq))
    .catch(e => console.warn('[mailer] 询价提醒异常：', e.message));
});

router.post('/course-interest', rateLimit('ci', 20, 600e3), (req, res) => {
  const { course_id, sid = '' } = req.body || {};
  const c = db.prepare('SELECT id,title FROM courses WHERE id=?').get(Number(course_id));
  if (!c) return res.status(404).json({ error: 'Corso non trovato' });
  analytics.record({ sid, userId: req.session.user ? req.session.user.id : null, type: 'course_interest', path: '/courses', meta: c.title });
  res.json({ ok: true });
});

// —— 埋点（sendBeacon / fetch）——
const TRACK_TYPES = new Set(['pageview', 'tool_click', 'cta_click', 'diagnosis_start', 'diagnosis_step', 'read_complete']);
router.post('/track', (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const { sid = '', type = '', path = '', ref = '', meta = '' } = body || {};
  if (!TRACK_TYPES.has(type)) return res.status(204).end();

  if (type === 'read_complete' && meta) {
    // 每会话每篇只计一次完读
    const seen = db.prepare(`SELECT id FROM analytics_events WHERE sid=? AND type='read_complete' AND meta=? LIMIT 1`).get(String(sid), String(meta));
    if (seen) return res.status(204).end();
    db.prepare('UPDATE posts SET read_completes = read_completes + 1 WHERE slug=?').run(String(meta));
  }
  analytics.record({ sid, userId: req.session.user ? req.session.user.id : null, type, path, ref, meta });
  res.status(204).end();
});

module.exports = router;
