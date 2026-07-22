// 埋点与看板聚合：pageview / tool_click / register / diagnosis_submit / read_complete 等
// 事件写入 analytics_events，管理后台按时间窗聚合。
const { db } = require('./db');

const SELF_HOSTS = new Set(['localhost', '127.0.0.1', 'geopro.cc', 'www.geopro.cc', (process.env.SITE_HOST || '').toLowerCase()].filter(Boolean));

function classifyRef(ref) {
  if (!ref) return '直接访问';
  let host = '';
  try { host = new URL(ref).hostname.toLowerCase(); } catch (_) { return '直接访问'; }
  if (SELF_HOSTS.has(host)) return '直接访问';
  if (/baidu|google|bing|sogou|so\.com|sm\.cn|yandex|duckduckgo/.test(host)) return '搜索引擎';
  if (/weixin|wechat|qq\.com/.test(host)) return '微信 / 公众号';
  return 'LinkedIn / 其他';
}

const insEvt = db.prepare(`INSERT INTO analytics_events(sid,user_id,type,path,ref_class,meta)
  VALUES (@sid,@userId,@type,@path,@refClass,@meta)`);

function record({ sid = '', userId = null, type, path = '', ref = '', refClass = null, meta = '' }) {
  if (!type || typeof type !== 'string') return;
  insEvt.run({
    sid: String(sid).slice(0, 64),
    userId,
    type: type.slice(0, 32),
    path: String(path).slice(0, 200),
    refClass: refClass || classifyRef(String(ref).slice(0, 500)),
    meta: String(meta).slice(0, 200),
  });
}

// range: 7 | 30 | 0（全部）
function windowClause(days, col = 'created_at') {
  return days > 0 ? `${col} >= datetime('now', '-${Math.floor(days)} days')` : '1=1';
}

function count(sql, ...args) {
  return db.prepare(sql).get(...args).c || 0;
}

function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

function deltaLabel(cur, prev) {
  if (prev <= 0) return cur > 0 ? '新增数据' : '暂无数据';
  const d = ((cur - prev) / prev) * 100;
  const arrow = d >= 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(d).toFixed(1)}% vs 上一周期`;
}

function dashboard(days) {
  const W = windowClause(days);
  const pv = count(`SELECT COUNT(*) c FROM analytics_events WHERE type='pageview' AND ${W}`);
  const uv = count(`SELECT COUNT(DISTINCT sid) c FROM analytics_events WHERE type='pageview' AND ${W}`);
  const toolUse = count(`SELECT COUNT(*) c FROM analytics_events WHERE type='tool_click' AND ${W}`);

  // 上一等长周期（仅在有限时间窗时计算）
  let pvDelta = '', uvDelta = '', toolDelta = '';
  if (days > 0) {
    const PREV = `created_at >= datetime('now', '-${days * 2} days') AND created_at < datetime('now', '-${days} days')`;
    pvDelta = deltaLabel(pv, count(`SELECT COUNT(*) c FROM analytics_events WHERE type='pageview' AND ${PREV}`));
    uvDelta = deltaLabel(uv, count(`SELECT COUNT(DISTINCT sid) c FROM analytics_events WHERE type='pageview' AND ${PREV}`));
    toolDelta = deltaLabel(toolUse, count(`SELECT COUNT(*) c FROM analytics_events WHERE type='tool_click' AND ${PREV}`));
  }

  const usersTotal = count('SELECT COUNT(*) c FROM users');
  const usersMonth = count(`SELECT COUNT(*) c FROM users WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`);

  // 每日趋势（全部=近90天）
  const trendDays = days > 0 ? days : 90;
  const rows = db.prepare(`
    SELECT date(created_at, '+8 hours') d,
           COUNT(*) pv,
           COUNT(DISTINCT sid) uv
    FROM analytics_events
    WHERE type='pageview' AND created_at >= datetime('now', '-${trendDays} days')
    GROUP BY d ORDER BY d`).all();
  const byDay = new Map(rows.map(r => [r.d, r]));
  const trend = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = db.prepare(`SELECT date('now', '+8 hours', '-${i} days') d`).get().d;
    const r = byDay.get(d);
    trend.push({ d, pv: r ? r.pv : 0, uv: r ? r.uv : 0 });
  }

  // 流量来源（会话首次触点）
  const srcRows = db.prepare(`
    SELECT ref_class, COUNT(*) n FROM (
      SELECT sid, ref_class, MIN(id) FROM analytics_events
      WHERE type='pageview' AND ${W} AND sid != ''
      GROUP BY sid
    ) GROUP BY ref_class`).all();
  const ORDER = ['搜索引擎', '微信 / 公众号', '直接访问', 'LinkedIn / 其他'];
  const srcMap = Object.fromEntries(ORDER.map(k => [k, 0]));
  let srcTotal = 0;
  for (const r of srcRows) {
    const k = ORDER.includes(r.ref_class) ? r.ref_class : 'LinkedIn / 其他';
    srcMap[k] += r.n; srcTotal += r.n;
  }
  const sources = ORDER.map(k => ({ label: k, pct: pct(srcMap[k], srcTotal) }));

  // 工具使用排行
  const toolRank = db.prepare(`
    SELECT meta name, COUNT(*) n FROM analytics_events
    WHERE type='tool_click' AND meta != '' AND ${W}
    GROUP BY meta ORDER BY n DESC LIMIT 6`).all();

  // 注册转化漏斗
  const visits = uv;
  const browsed = count(`SELECT COUNT(DISTINCT sid) c FROM analytics_events
    WHERE type='pageview' AND (path LIKE '/tools%' OR path LIKE '/courses%') AND ${W}`);
  const loginPage = count(`SELECT COUNT(DISTINCT sid) c FROM analytics_events
    WHERE type='pageview' AND path LIKE '/login%' AND ${W}`);
  const registered = count(`SELECT COUNT(*) c FROM analytics_events WHERE type='register' AND ${W}`);
  const submitted = count(`SELECT COUNT(*) c FROM analytics_events WHERE type='diagnosis_submit' AND ${W}`);
  const funnel = [
    { label: '访问站点', n: visits },
    { label: '浏览工具/课程', n: browsed },
    { label: '进入注册页', n: loginPage },
    { label: '完成注册', n: registered },
    { label: '提交诊断', n: submitted },
  ].map(f => ({ ...f, pct: pct(f.n, visits) }));

  // 文章阅读 Top 5
  const topPosts = db.prepare(`
    SELECT title, published_at, views, read_completes FROM posts
    WHERE status='published' ORDER BY views DESC LIMIT 5`).all()
    .map(p => ({ ...p, completion: p.views > 0 ? Math.min(100, Math.round((p.read_completes / p.views) * 100)) : 0 }));

  return {
    pv, uv, toolUse, pvDelta, uvDelta, toolDelta,
    usersTotal, usersMonth,
    trend, sources, toolRank, funnel, topPosts,
  };
}

// 趋势折线 → SVG polyline 坐标（视图盒 720×180，与设计稿一致）
function trendPoints(trend, key) {
  const max = Math.max(1, ...trend.map(t => t.pv));
  const n = trend.length;
  return trend.map((t, i) => {
    const x = n > 1 ? Math.round((i / (n - 1)) * 720) : 720;
    const y = Math.round(174 - (t[key] / max) * 150);
    return `${x},${y}`;
  }).join(' ');
}

function usersList() {
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.source, u.created_at,
      (SELECT COUNT(*) FROM analytics_events e WHERE e.user_id = u.id AND e.type='tool_click') tool_uses
    FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
}

function firstTouchSource(sid) {
  if (!sid) return '直接访问';
  const r = db.prepare(`SELECT ref_class FROM analytics_events WHERE sid=? AND type='pageview' ORDER BY id LIMIT 1`).get(sid);
  return r ? r.ref_class : '直接访问';
}

module.exports = { record, classifyRef, dashboard, trendPoints, usersList, firstTouchSource };
