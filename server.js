// Alan 个人IP与AI工具平台（HVAC × AI）— 服务入口
// Express + EJS 服务端渲染 + SQLite。生产环境由 nginx 反代（监听 127.0.0.1:8201）。
require('./src/load-env');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const { db } = require('./src/db');
const makeStore = require('./src/session-store');
const siteContent = require('./src/content');
const worker = require('./src/worker');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 8201);
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', PROD);

// —— 基础中间件 ——
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '300kb' }));
app.use(express.text({ type: ['text/plain'], limit: '50kb' })); // sendBeacon 兼容
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '7d' : 0 }));

let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  if (PROD) console.warn('[warn] 未配置 SESSION_SECRET，重启后会话将失效（请在 .env 中配置）');
}
app.use(session({
  name: 'alan.sid',
  secret,
  store: makeStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD ? 'auto' : false, maxAge: 7 * 864e5 },
}));

// —— 模板全局 ——
function fmtDate(s) {
  if (!s) return '—';
  s = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '.');
  const d = new Date(s.replace(' ', 'T') + (/[Z+]/.test(s) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10).replace(/-/g, '.');
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replace(/\//g, '.');
}
app.locals.fmtDate = fmtDate;
app.locals.fmtDT = s => {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T') + (/[Z+]/.test(String(s)) ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(s).slice(5, 16);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).replace(/\//g, '.');
};
app.locals.fmtNum = n => Number(n || 0).toLocaleString('en-US');
app.locals.money = cents => (cents == null ? '—' : `¥ ${Math.round(cents / 100).toLocaleString('en-US')}`);
// 静态资源版本号（每次进程启动变化；autopull 部署会重启进程 → 自动刷新浏览器缓存）
app.locals.assetVer = Date.now().toString(36);
// 站点文案键值层（后台「页面内容」可编辑，默认值=设计稿文案）
app.locals.ct = siteContent.ct;
app.locals.ctBr = siteContent.ctBr;
app.locals.ctImg = siteContent.ctImg;

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  next();
});

// —— 路由 ——
app.use('/', require('./src/routes/pages'));
app.use('/api/agent', require('./src/routes/agent-api')); // 外部 Agent（Bearer 令牌）
app.use('/api', require('./src/routes/api'));
app.use('/', require('./src/routes/admin'));

app.use((req, res) => res.status(404).render('404', { title: '页面不存在 · Alan', active: '' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: '服务器开小差了，请稍后再试' });
  res.status(500).render('404', { title: '出错了 · Alan', active: '', message: '服务器开小差了，请稍后再试。' });
});

app.listen(PORT, HOST, () => {
  console.log(`Alan platform 已启动：http://${HOST}:${PORT}（NODE_ENV=${process.env.NODE_ENV || 'development'}）`);
  worker.start(); // 站内自动化：评论巡检 / 积压补处理 / 心跳
});
