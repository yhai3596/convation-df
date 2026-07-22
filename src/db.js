// SQLite 数据层：schema + 内容种子（内容来自设计交付稿，可在管理后台维护）
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  source TEXT NOT NULL DEFAULT '直接访问',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '行业观察',
  excerpt TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  read_minutes INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  read_completes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  parent_id INTEGER,
  is_agent INTEGER NOT NULL DEFAULT 0,
  agent_label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lectures INTEGER,
  price_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'live',
  tag TEXT NOT NULL DEFAULT '',
  kicker TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metric_value TEXT NOT NULL DEFAULT '',
  metric_label TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'live',
  url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS diagnosis_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  level TEXT NOT NULL,
  spots INTEGER NOT NULL,
  summary TEXT NOT NULL,
  report_json TEXT NOT NULL,
  generator TEXT NOT NULL DEFAULT 'template',
  emailed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT,
  user_id INTEGER,
  type TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  ref_class TEXT NOT NULL DEFAULT '直接访问',
  meta TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON analytics_events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_sid ON analytics_events(sid);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                  -- preventivo | riparazione | contatto
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',      -- 询价品类（Climatizzatore/Pompa di calore/…）等表单附加维度
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'it',
  status TEXT NOT NULL DEFAULT 'new',  -- new | handled（后台处理状态）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agent_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_time ON agent_activity(created_at);
`);

// ---------- 增量迁移（线上库为既有 schema，只做加列，幂等） ----------
function addColumn(table, colDef) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`); } catch (_) { /* 已存在 */ }
}
addColumn('posts', "created_by TEXT NOT NULL DEFAULT 'admin'");     // admin | ai | agent:<name>
addColumn('posts', "lang TEXT NOT NULL DEFAULT 'it'");               // Notizie 双语：it | en（小龙虾/hermes 供稿时带上）
addColumn('comments', 'agent_status TEXT');                          // NULL/pending=待自动处理 replied/skipped=已终态
addColumn('courses', "cover_url TEXT NOT NULL DEFAULT ''");
// 两段式删除：0=正常 1=已归档（前台隐藏、后台可恢复），归档态再删才物理移除。
// 用独立列而非复用 status——courses/tools 的 status 已表示业务态（live=已上线 / coming=筹备中），两者正交。
addColumn('courses', 'archived INTEGER NOT NULL DEFAULT 0');
addColumn('tools', 'archived INTEGER NOT NULL DEFAULT 0');
addColumn('cases', 'archived INTEGER NOT NULL DEFAULT 0');
// 存量评论：已有回复的顶层评论视为已处理，避免 Worker 重复回帖
db.exec(`UPDATE comments SET agent_status='replied'
  WHERE parent_id IS NULL AND agent_status IS NULL
    AND id IN (SELECT DISTINCT parent_id FROM comments WHERE parent_id IS NOT NULL)`);

const getSetting = (k, d = null) => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : d;
};
const setSetting = (k, v) =>
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));

// ---------- 内容种子 ----------
// Convation：Notizie 初始为空态（空态文案已在前台就位），内容由 Agent API（小龙虾/Hermes）供稿或后台创建。
// alan 骨架的中文种子文/工具/课程/案例已清除，空表不再重播。
function seedContent() {}

// 运行配置默认值（每次启动补齐缺失项，不覆盖已有值）
function seedDefaults() {
  const defaults = {
    agent_autoreply: '1',        // 评论自动回复（用户决策：自动）
    agent_content_review: '1',   // Agent/AI 产出内容走草稿审核（用户决策：审核制）
    agent_scan_interval_min: '5' // Worker 巡检间隔（分钟）
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === null) setSetting(k, v);
  }
}

// ---------- 管理员种子 ----------
function seedAdmin() {
  if (db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@alan-ai.local';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) { password = crypto.randomBytes(9).toString('base64url'); generated = true; }
  db.prepare("INSERT INTO users(email,name,password_hash,role) VALUES (?,?,?,'admin')")
    .run(email, 'Alan', bcrypt.hashSync(password, 10));
  if (generated) {
    const credFile = path.join(DATA_DIR, 'admin-credentials.txt');
    fs.writeFileSync(credFile, `管理员账号（首次启动自动生成，请尽快登录后妥善保存/修改）\nemail: ${email}\npassword: ${password}\n`);
    console.log(`[seed] 管理员已创建：${email}（初始密码见 ${credFile}）`);
  } else {
    console.log(`[seed] 管理员已创建：${email}（密码来自 ADMIN_PASSWORD 环境变量）`);
  }
}

// ---------- 演示数据（仅本地验证用：SEED_DEMO=1；生产不启用） ----------
function seedDemo() {
  if (process.env.SEED_DEMO !== '1') return;
  if (getSetting('demo_seeded') === '1') return;

  const demoUsers = [
    ['wang@hvac-co.cn', '王工', '搜索引擎', 3],
    ['li.chen@example.com', 'Li Chen', 'LinkedIn / 其他', 5],
    ['zhang@manufact.cn', '张经理', '微信 / 公众号', 9],
    ['liu@coolsys.cn', '刘工', '直接访问', 17],
    ['amy@nagroup.com', 'Amy Zhou', '搜索引擎', 25],
  ];
  const insUser = db.prepare(`INSERT INTO users(email,name,password_hash,role,source,created_at)
    VALUES (?,?,?,'member',?,datetime('now','-'||?||' days'))`);
  const pw = bcrypt.hashSync('demo12345', 10);
  const userIds = {};
  for (const [email, name, source, daysAgo] of demoUsers) {
    const r = insUser.run(email, name, pw, source, daysAgo);
    userIds[name] = r.lastInsertRowid;
  }

  // 设计稿文章页的示例评论（含 Agent 自动回复示例）
  const post = db.prepare('SELECT id FROM posts WHERE slug=?').get('hvac-ai-landing-stuck-where');
  if (post) {
    const insC = db.prepare(`INSERT INTO comments(post_id,user_id,author_name,body,parent_id,is_agent,agent_label,created_at)
      VALUES (?,?,?,?,?,?,?,datetime('now','-'||?||' days'))`);
    const c1 = insC.run(post.id, userIds['王工'], '王工',
      '卡点二太真实了。我们去年做的质检 AI 试点就是这样，演示效果很好，但产线上没人愿意改流程。请问 AHRI 竞品分析工具支持热泵品类吗？', null, 0, null, 6);
    insC.run(post.id, null, 'Alan',
      '支持的。AHRI 竞品分析工具目前覆盖 AHRI 目录中的热泵与单元机品类，登录后在「品类」筛选中选择 Heat Pump 即可。详细说明见工具页文档。', c1.lastInsertRowid, 1, 'AI 自动回复 · via 小龙虾', 6);
    const c2 = insC.run(post.id, userIds['Amy Zhou'], 'Amy Zhou',
      '"把 AI 当能力而不是项目"——这句话准备贴在办公室了。期待展开写写怎么建内部 AI 能力。', null, 0, null, 5);
    insC.run(post.id, null, 'Alan', '已经在写了，下一篇就是。会结合两家企业内训的真实案例。', c2.lastInsertRowid, 0, '本人回复', 4);
    const c3 = insC.run(post.id, userIds['刘工'], '刘工', 'AI 诊断问卷大概要填多久？需要准备什么材料吗？', null, 0, null, 3);
    insC.run(post.id, null, 'Alan',
      '约 10 分钟，不需要提前准备材料——问卷围绕业务现状与目标，凭日常了解即可作答。完成后诊断报告会发送到您的邮箱。入口在「企业AI服务」页。', c3.lastInsertRowid, 1, 'AI 自动回复 · via 小龙虾', 3);
  }

  // 30 天内的模拟访问事件，让看板可视化有数据
  const insEvt = db.prepare(`INSERT INTO analytics_events(sid,user_id,type,path,ref_class,meta,created_at)
    VALUES (?,?,?,?,?,?,datetime('now','-'||?||' minutes'))`);
  const paths = ['/', '/', '/', '/tools', '/tools', '/services', '/courses', '/blog', '/article/hvac-ai-landing-stuck-where', '/cases', '/about', '/login'];
  const refs = ['搜索引擎', '搜索引擎', '搜索引擎', '搜索引擎', '微信 / 公众号', '微信 / 公众号', '直接访问', '直接访问', 'LinkedIn / 其他'];
  const toolNames = ['AHRI 竞品分析', 'HVAC Tool', 'HVAC Tool', '专利 AI 辅助助手', 'AHRI 竞品分析', '北美市场竞品分析'];
  const seedEvents = db.transaction(() => {
    for (let d = 29; d >= 0; d--) {
      const sessions = 6 + Math.floor(Math.random() * 6) + Math.floor((29 - d) / 4);
      for (let s = 0; s < sessions; s++) {
        const sid = `demo-${d}-${s}`;
        const ref = refs[Math.floor(Math.random() * refs.length)];
        const nPages = 1 + Math.floor(Math.random() * 4);
        for (let p = 0; p < nPages; p++) {
          const minutesAgo = d * 1440 + Math.floor(Math.random() * 1200);
          insEvt.run(sid, null, 'pageview', paths[Math.floor(Math.random() * paths.length)], ref, '', minutesAgo);
        }
        if (Math.random() < 0.35) {
          const minutesAgo = d * 1440 + Math.floor(Math.random() * 1200);
          insEvt.run(sid, null, 'tool_click', '/tools', ref, toolNames[Math.floor(Math.random() * toolNames.length)], minutesAgo);
        }
        if (Math.random() < 0.08) insEvt.run(sid, null, 'register', '/login', ref, '', d * 1440 + 60);
        if (Math.random() < 0.05) insEvt.run(sid, null, 'diagnosis_submit', '/diagnosis', ref, '', d * 1440 + 30);
        if (Math.random() < 0.5) {
          insEvt.run(sid, null, 'read_complete', '/article/hvac-ai-landing-stuck-where', ref, 'hvac-ai-landing-stuck-where', d * 1440 + 20);
        }
      }
    }
  });
  seedEvents();
  db.prepare("UPDATE posts SET views = views + abs(random() % 900) + 300 WHERE status='published'").run();
  db.prepare("UPDATE posts SET read_completes = views * (55 + abs(random() % 20)) / 100 WHERE status='published'").run();

  setSetting('demo_seeded', '1');
  console.log('[seed] 演示数据已注入（SEED_DEMO=1，仅用于本地验证）');
}

seedContent();
seedDefaults();
seedAdmin();
seedDemo();

module.exports = { db, getSetting, setSetting };
