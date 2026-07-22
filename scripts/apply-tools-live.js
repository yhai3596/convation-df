// 一次性·幂等：把 3 款工具落到工具集（v1.3.3）。可重复运行，不会产生重复卡。
//   ① 更新「AHRI」卡：简介 + url=https://ahri.geopro.cc
//   ② 更新「专利」卡：简介 + url=https://aipatent.lovable.app
//   ③ 新增/更新「企业财报解读」卡：url=https://finstar.geopro.cc（已存在则原地更新，不重复插入）
//
// 用法（务必先备份）：
//   cd /var/www/alan && node scripts/backup-db.js && node scripts/apply-tools-live.js
//
// 安全前提：只认已存在且已 seed 的库；库不存在或 tools 表为空一律拒绝退出，
//   避免 better-sqlite3 对错误路径“直接建一个空库”的坑（CLAUDE.md 规则 5.10④）。
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 路径口径与 src/db.js:8 / backup-db.js 一致。不 require('../src/db')（避免建表/迁移/种子副作用）。
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`[拒绝] 找不到数据库：${DB_PATH}（若数据目录非默认，用 DATA_DIR=/path node scripts/apply-tools-live.js）`);
  process.exit(2);
}

const db = new Database(DB_PATH); // 可写连接（应用在跑也没关系：WAL 支持并发读 + 单写）
const total = db.prepare('SELECT COUNT(*) c FROM tools').get().c;
if (total < 1) {
  console.error(`[拒绝] tools 表为空——大概率打开了错误/未初始化的库：${DB_PATH}`);
  process.exit(3);
}

const fmt = t => `  no=${t.no} | id=${t.id} | ${t.name} | ${t.status} | url=${t.url || '(空)'} | arch=${t.archived}`;
const all = () => db.prepare('SELECT id,no,name,status,url,archived FROM tools ORDER BY no').all();

console.log(`DB = ${DB_PATH}`);
console.log('=== BEFORE ===');
all().forEach(t => console.log(fmt(t)));

const actions = [];
const upd = db.prepare("UPDATE tools SET description=?, status='live', url=?, updated_at=datetime('now') WHERE id=?");

const AHRI_DESC = '基于 AHRI 认证数据的竞品数据查询与竞品动态跟踪。';
const PAT_DESC = 'AI 辅助的专利技术交底书撰写系统：从技术要点到交底书初稿。';
const FIN_NAME = '企业财报解读';
const FIN_DESC = '企业财报解读与财务分析训练室：读懂三大报表、拆解关键财务指标，边学边练。';

const applyOne = (label, rows, desc, url) => {
  if (rows.length === 1) { upd.run(desc, url, rows[0].id); actions.push(`✓ 更新「${label}」卡 id=${rows[0].id} → url=${url}`); }
  else actions.push(`⚠ 跳过「${label}」：匹配到 ${rows.length} 行（预期 1），未改动，请人工核对`);
};

const tx = db.transaction(() => {
  // ① AHRI（保留原卡名，仅改简介+url+状态）
  applyOne('AHRI', db.prepare("SELECT * FROM tools WHERE name LIKE '%AHRI%' AND archived=0").all(), AHRI_DESC, 'https://ahri.geopro.cc');
  // ② 专利（保留原卡名）
  applyOne('专利', db.prepare("SELECT * FROM tools WHERE name LIKE '%专利%' AND archived=0").all(), PAT_DESC, 'https://aipatent.lovable.app');
  // ③ 财报（幂等：存在则原地更新，否则以 MAX(no)+1 新增）
  const fin = db.prepare('SELECT * FROM tools WHERE url LIKE ? OR name=?').all('%finstar.geopro.cc%', FIN_NAME);
  if (fin.length >= 1) {
    upd.run(FIN_DESC, 'https://finstar.geopro.cc', fin[0].id);
    db.prepare('UPDATE tools SET name=? WHERE id=?').run(FIN_NAME, fin[0].id);
    actions.push(`✓ 「${FIN_NAME}」已存在，原地更新 id=${fin[0].id}（未重复插入）`);
  } else {
    const no = (db.prepare('SELECT MAX(no) m FROM tools').get().m || 0) + 1;
    const r = db.prepare('INSERT INTO tools(no,name,description,status,url) VALUES (?,?,?,?,?)')
      .run(no, FIN_NAME, FIN_DESC, 'live', 'https://finstar.geopro.cc');
    actions.push(`✓ 新增「${FIN_NAME}」卡 no=${no} id=${r.lastInsertRowid}`);
  }
});
tx();

console.log('=== ACTIONS ===');
actions.forEach(a => console.log('  ' + a));
console.log('=== AFTER ===');
all().forEach(t => console.log(fmt(t)));
console.log('完成。前台 https://geopro.cc/tools 刷新即见效（工具为即时查询，无需重启）。');
db.close();
