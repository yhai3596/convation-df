// 前台页面渲染
const express = require('express');
const { marked } = require('marked');
const { db } = require('../db');
const { QUESTIONS } = require('../report');
const mailer = require('../mailer');

const router = express.Router();

router.get('/', (req, res) => {
  const posts = db.prepare("SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 3").all();
  res.render('home', { title: 'Alan · HVAC × AI — 把 AI 真正用进制造业', active: '首页', posts });
});

router.get('/about', (req, res) => {
  res.render('about', { title: '关于 · Alan · HVAC × AI', active: '关于' });
});

router.get('/services', (req, res) => {
  res.render('services', { title: '企业 AI 服务 · Alan · HVAC × AI', active: '企业AI服务' });
});

router.get('/tools', (req, res) => {
  const tools = db.prepare('SELECT * FROM tools WHERE archived=0 ORDER BY no').all();
  res.render('tools', { title: '工具集 · Alan · HVAC × AI', active: '工具集', tools });
});

router.get('/blog', (req, res) => {
  const cat = (req.query.cat || '').slice(0, 20);
  const cats = db.prepare("SELECT DISTINCT category FROM posts WHERE status='published'").all().map(r => r.category);
  const posts = cat
    ? db.prepare("SELECT * FROM posts WHERE status='published' AND category=? ORDER BY published_at DESC").all(cat)
    : db.prepare("SELECT * FROM posts WHERE status='published' ORDER BY published_at DESC").all();
  res.render('blog', { title: 'AI 资讯 · Alan · HVAC × AI', active: 'AI资讯', posts, cats, cat });
});

router.get('/article/:slug', (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").get(req.params.slug);
  if (!post) return res.status(404).render('404', { title: '页面不存在', active: '' });
  db.prepare('UPDATE posts SET views = views + 1 WHERE id=?').run(post.id);
  post.views += 1;

  const all = db.prepare('SELECT * FROM comments WHERE post_id=? ORDER BY created_at, id').all(post.id);
  const comments = all.filter(c => !c.parent_id).map(c => ({ ...c, replies: all.filter(r => r.parent_id === c.id) }));

  res.render('article', {
    title: `${post.title} · Alan · HVAC × AI`,
    active: 'AI资讯',
    post,
    contentHtml: marked.parse(post.content_md || ''),
    comments,
    commentCount: all.filter(c => !c.parent_id).length,
  });
});

router.get('/cases', (req, res) => {
  const cases = db.prepare('SELECT * FROM cases WHERE archived=0 ORDER BY sort').all();
  res.render('cases', { title: '案例与培训 · Alan · HVAC × AI', active: '案例·培训', cases });
});

router.get('/courses', (req, res) => {
  const courses = db.prepare('SELECT * FROM courses WHERE archived=0 ORDER BY no').all();
  res.render('courses', { title: 'AI 课程 · Alan · HVAC × AI', active: 'AI课程', courses });
});

router.get('/diagnosis', (req, res) => {
  res.render('diagnosis', { title: '企业 AI 诊断 · Alan · HVAC × AI', active: '企业AI服务', questions: QUESTIONS, mailerOn: mailer.enabled() });
});

router.get('/login', (req, res) => {
  if (res.locals.user) return res.redirect(req.query.next || '/');
  res.render('login', { title: '登录 · Alan · HVAC × AI', active: '', next: req.query.next || '/' });
});

// Agent API 文档（管理员，渲染 docs/AGENT_API.md）
router.get('/docs/agent-api', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login?next=/docs/agent-api');
  const fs = require('fs');
  const path = require('path');
  let html = '<p>文档缺失。</p>';
  try { html = marked.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'AGENT_API.md'), 'utf8')); } catch (e) { /* noop */ }
  res.render('doc', { title: 'Agent API 文档 · Alan', active: '', contentHtml: html });
});

module.exports = router;
