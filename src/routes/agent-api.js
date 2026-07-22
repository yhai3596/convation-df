// 对外 Agent API（小龙虾 / Hermes 等外部 CLI Agent 接入通道）
// 认证：Authorization: Bearer alan_xxx（后台生成，sha256 哈希存储，可吊销）
// 权限模型（与后台开关联动）：
//   - 发布内容：受「内容审核制」约束——开启时一律落草稿，Alan 后台一键发布
//   - 评论回复：直接上线（用户决策：评论回复全自动），带 Agent 标注
// 所有调用刷新令牌 last_used 与全局心跳，写入 agent_activity 供后台审计。
const express = require('express');
const crypto = require('crypto');
const { db, setSetting } = require('./../db');
const { agentModes, logActivity } = require('./../config');

const router = express.Router();

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// —— 按令牌限流（比公开接口宽松） ——
const buckets = new Map();
function rateLimitToken(req, res, next) {
  const key = req.agentTokenId;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + 600e3 }; buckets.set(key, b); }
  if (++b.n > 240) return res.status(429).json({ error: '调用过于频繁（240 次/10 分钟）' });
  next();
}

// —— Bearer 认证 ——
function requireToken(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(alan_[A-Za-z0-9_-]{20,})$/);
  if (!m) return res.status(401).json({ error: '缺少或格式错误的 Bearer 令牌' });
  const row = db.prepare('SELECT id, name, revoked FROM api_tokens WHERE token_hash=?').get(sha256(m[1]));
  if (!row || row.revoked) return res.status(401).json({ error: '令牌无效或已吊销' });
  req.agentTokenId = row.id;
  req.agentName = row.name;
  db.prepare("UPDATE api_tokens SET last_used_at=datetime('now') WHERE id=?").run(row.id);
  setSetting('agent_last_active', new Date().toISOString());
  next();
}

router.use(requireToken, rateLimitToken);

// —— 状态与心跳：外部 Agent 据此自适应（模式、待处理队列） ——
router.get('/status', (req, res) => {
  const modes = agentModes();
  const pending = db.prepare(`SELECT COUNT(*) c FROM comments WHERE parent_id IS NULL AND is_agent=0 AND (agent_status IS NULL OR agent_status='pending')`).get().c;
  const skipped = db.prepare("SELECT COUNT(*) c FROM comments WHERE agent_status='skipped'").get().c;
  const draftsAwaiting = db.prepare("SELECT COUNT(*) c FROM posts WHERE status='draft'").get().c;
  const messages = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
  res.json({
    ok: true, agent: req.agentName,
    modes: { content_review: modes.contentReview, comment_autoreply: modes.autoreply },
    queue: { comments_pending: pending, comments_skipped: skipped, drafts_awaiting_review: draftsAwaiting, messages_total: messages },
    server_time: new Date().toISOString(),
  });
});

// —— 发布内容：审核制开启时落草稿 ——
router.post('/posts', (req, res) => {
  const { title = '', category = '行业观察', excerpt = '', content_md = '', read_minutes = 5 } = req.body || {};
  const t = String(title).trim();
  if (!t) return res.status(400).json({ error: '缺少标题 title' });
  if (!String(content_md).trim()) return res.status(400).json({ error: '缺少正文 content_md' });

  const review = agentModes().contentReview;
  const status = review ? 'draft' : 'published';
  const publishedAt = review ? null : db.prepare("SELECT date('now','+8 hours') d").get().d;
  const slug = `post-${Date.now().toString(36)}`;
  const rm = Math.max(1, Math.min(120, Number(read_minutes) || 5));
  const r = db.prepare(`INSERT INTO posts(slug,title,category,excerpt,content_md,read_minutes,status,published_at,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(slug, t, String(category).trim() || '行业观察', String(excerpt).trim().slice(0, 300), String(content_md), rm, status, publishedAt, `agent:${req.agentName}`);
  logActivity(`agent:${req.agentName}`, 'post_create', `post#${r.lastInsertRowid}`, `${t.slice(0, 50)} → ${status === 'draft' ? '草稿待审' : '直接发布'}`, true);
  res.json({
    ok: true, id: r.lastInsertRowid, slug, status,
    note: status === 'draft' ? '内容审核制开启：已存为草稿，待 Alan 后台审核发布' : '已直接发布',
  });
});

// —— 拉取评论（默认未处理队列；含文章上下文，供外部 Agent 生成回复） ——
router.get('/comments', (req, res) => {
  const status = String(req.query.status || 'pending');
  const limit = Math.min(50, Number(req.query.limit) || 20);
  let where;
  if (status === 'pending') where = "AND (c.agent_status IS NULL OR c.agent_status='pending')";
  else if (status === 'skipped') where = "AND c.agent_status='skipped'";
  else where = '';
  const rows = db.prepare(`
    SELECT c.id, c.body, c.author_name, c.created_at, c.agent_status,
           p.id post_id, p.slug post_slug, p.title post_title
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE c.parent_id IS NULL AND c.is_agent = 0 ${where}
    ORDER BY c.id DESC LIMIT ?`).all(limit);
  res.json({ ok: true, count: rows.length, comments: rows });
});

// —— 提交评论回复：直接上线（全自动模式），带外部 Agent 标注 ——
router.post('/comments/:id/reply', (req, res) => {
  const id = Number(req.params.id);
  const body = String((req.body || {}).body || '').trim();
  if (body.length < 2 || body.length > 600) return res.status(400).json({ error: '回复内容需在 2–600 字之间' });
  const c = db.prepare('SELECT id, post_id, agent_status FROM comments WHERE id=? AND parent_id IS NULL AND is_agent=0').get(id);
  if (!c) return res.status(404).json({ error: '评论不存在或不可回复' });
  if (c.agent_status === 'replied') return res.status(409).json({ error: '该评论已有自动回复' });

  const r = db.prepare(`INSERT INTO comments(post_id,user_id,author_name,body,parent_id,is_agent,agent_label,agent_status)
    VALUES (?,NULL,'Alan',?,?,1,?,'replied')`)
    .run(c.post_id, body, c.id, `AI 自动回复 · via ${req.agentName}`);
  db.prepare("UPDATE comments SET agent_status='replied' WHERE id=?").run(c.id);
  logActivity(`agent:${req.agentName}`, 'comment_reply', `comment#${c.id}`, body.slice(0, 60), true);
  res.json({ ok: true, reply_id: r.lastInsertRowid });
});

// —— 站内留言（只读，供外部 Agent 汇总/转发提醒） ——
router.get('/messages', (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const rows = db.prepare('SELECT id, name, email, body, created_at FROM messages ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ ok: true, count: rows.length, messages: rows });
});

module.exports = router;
