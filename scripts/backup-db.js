// 备份 SQLite 数据库（热备 · WAL 安全 · 自校验 · 自动保留最近 N 份）。
// 用法：node scripts/backup-db.js [--keep N] [--dir 目录]
//   默认备份到 <DATA_DIR>/backups/app-YYYYMMDD-HHMMSS.db（UTC 时间戳），保留最近 14 份。
//
// 为什么必须用本脚本、而不是 cp app.db：
//   库跑在 WAL 模式下，新数据先落 app.db-wal，未 checkpoint 前主库文件几乎是空的
//   （实测 app.db 4KB / app.db-wal 2.3MB）。直接拷 app.db 会得到一个能打开、但内容近乎为空的库——
//   比没有备份更危险。本脚本走 SQLite 官方 Online Backup API，WAL 内容会一并合并进备份，
//   且服务运行中可直接执行，无需停服。
//
// 服务器上按天备份（cron，凌晨 4 点）：
//   0 4 * * * cd /var/www/alan && /usr/bin/node scripts/backup-db.js >> /var/log/alan-backup.log 2>&1
//
// 从备份恢复：停服 → 删除 app.db/app.db-wal/app.db-shm → 把备份文件复制为 app.db → 启动。
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 路径口径与 src/db.js:8 一致。此处不 require('../src/db')——那会触发建表/迁移/种子等副作用，备份必须只读零副作用。
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SRC = path.join(DATA_DIR, 'app.db');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rm = p => { try { fs.unlinkSync(p); } catch (_) { /* 不存在 */ } };
const rmDb = p => { rm(p); rm(`${p}-wal`); rm(`${p}-shm`); };
const KEEP = Math.max(1, Number(arg('--keep', 14)) || 14);
const OUT_DIR = arg('--dir', path.join(DATA_DIR, 'backups'));

if (!fs.existsSync(SRC)) {
  console.error(`✗ 找不到数据库：${SRC}`);
  console.error('  若数据目录不在默认位置，用 DATA_DIR=/path/to/data node scripts/backup-db.js');
  process.exit(1);
}

const iso = new Date().toISOString().replace(/[-:T]/g, '');
const stamp = `${iso.slice(0, 8)}-${iso.slice(8, 14)}`;
const dest = path.join(OUT_DIR, `app-${stamp}.db`);

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const src = new Database(SRC, { readonly: true });
  await src.backup(dest);
  src.close();

  // 自校验 + 定型：坏备份/空备份留着比没有更危险，宁可删掉并非零退出（cron 可据此告警）。
  // 用可写连接打开：校验后转 journal_mode=DELETE，把 WAL 落回主文件并移除 -wal/-shm，
  // 使备份成为「单文件即完整」的产物——否则备份自身也带 WAL 伴生文件，等于重蹈本脚本要解决的覆辙
  // （只读连接无权 checkpoint，关闭时清不掉伴生文件）。恢复后由 src/db.js 启动时重新设回 WAL。
  const b = new Database(dest);
  const integrity = b.pragma('integrity_check', { simple: true });
  const tables = b.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  const counts = {};
  for (const t of tables) counts[t] = b.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const rows = Object.values(counts).reduce((a, c) => a + c, 0);
  const okToKeep = integrity === 'ok' && tables.length > 0 && rows > 0;
  if (okToKeep) b.pragma('journal_mode = DELETE');
  b.close();

  if (integrity !== 'ok') {
    rmDb(dest);
    console.error(`✗ 完整性校验失败（${integrity}），已删除该备份`);
    process.exit(1);
  }
  if (!tables.length || !rows) {
    rmDb(dest);
    console.error(`✗ 备份内容为空（${tables.length} 表 / ${rows} 行）——疑似源库异常，已删除该备份`);
    process.exit(1);
  }

  const mb = (fs.statSync(dest).size / 1048576).toFixed(2);
  console.log(`✓ 备份完成：${dest}`);
  console.log(`  ${mb} MB · 完整性 ${integrity} · ${tables.length} 表 / ${rows} 行`);
  const key = ['users', 'posts', 'comments', 'courses', 'tools', 'cases'].filter(t => counts[t] != null);
  if (key.length) console.log(`  ${key.map(t => `${t}=${counts[t]}`).join('  ')}`);

  // 保留最近 KEEP 份（文件名按 UTC 时间戳，字典序 = 时间序）
  const all = fs.readdirSync(OUT_DIR).filter(f => /^app-\d{8}-\d{6}\.db$/.test(f)).sort().reverse();
  const drop = all.slice(KEEP);
  for (const f of drop) rmDb(path.join(OUT_DIR, f));

  // 自愈：把仍处于 WAL 态的备份（异常中断/旧版脚本遗留）并回单文件，
  // 保证「目录内每个备份都单文件即完整」这一承诺始终成立。转 DELETE 会先把 -wal 内容并入主库，不丢数据。
  let healed = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!/^app-\d{8}-\d{6}\.db$/.test(f)) continue;
    const p = path.join(OUT_DIR, f);
    if (!fs.existsSync(`${p}-wal`) && !fs.existsSync(`${p}-shm`)) continue;
    try { const h = new Database(p); h.pragma('journal_mode = DELETE'); h.close(); healed++; } catch (_) { /* 异常文件跳过，不阻断本次备份 */ }
  }
  // 清理孤儿伴生文件（主文件已不在）
  let orphans = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    const m = /^(app-\d{8}-\d{6}\.db)-(wal|shm)$/.exec(f);
    if (m && !fs.existsSync(path.join(OUT_DIR, m[1]))) { rm(path.join(OUT_DIR, f)); orphans++; }
  }
  const extra = [drop.length && `已清理 ${drop.length} 份旧备份`, healed && `并回 ${healed} 份 WAL 态备份`, orphans && `清理 ${orphans} 个孤儿文件`].filter(Boolean);
  console.log(`  现存 ${all.length - drop.length} 份（上限 ${KEEP}）${extra.length ? `，${extra.join('，')}` : ''}`);
})().catch(e => {
  console.error('✗ 备份失败：', e.message);
  process.exit(1);
});
