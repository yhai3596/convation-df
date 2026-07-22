// 把服务器上的数据库备份拉到本机（异地备份）。默认先让服务器生成一份新备份，再拉取本地缺失的。
// 用法：npm run pull-backups
//      node scripts/pull-backups.js --user root --key ~/.ssh/id_ed25519 --keep 30
//      node scripts/pull-backups.js --no-fresh        只拉服务器已有的，不新生成
//      node scripts/pull-backups.js --dir D:/备份     指定本地存放目录
// 配置也可用环境变量：ALAN_SSH_HOST / ALAN_SSH_USER / ALAN_SSH_KEY
//
// 前置：本机需能免密 ssh 到服务器（详见 README「数据库与备份 · 异地拉取」）。
//
// 为什么用 scp 而不是 rsync：本机（Windows）无 rsync，而 ssh/scp 是 Win10+ 自带 OpenSSH。
// 增量逻辑由本脚本自己做：备份文件名含 UTC 时间戳且内容不可变，比对文件名即可判断是否已拉过。
//
// 备份与数据库同机同盘时，只能防「误删/改错数据」，防不了整机故障——本脚本就是补这一环。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const has = name => process.argv.includes(name);
const tilde = p => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const rm = p => { try { fs.unlinkSync(p); } catch (_) { /* 不存在 */ } };
const rmDb = p => { rm(p); rm(`${p}-wal`); rm(`${p}-shm`); };

const HOST = arg('--host', process.env.ALAN_SSH_HOST || '43.156.58.154');
const USER = arg('--user', process.env.ALAN_SSH_USER || 'root');
const KEY = tilde(arg('--key', process.env.ALAN_SSH_KEY || ''));
const APP_DIR = arg('--app-dir', '/var/www/alan');
const REMOTE_DIR = arg('--remote-dir', `${APP_DIR}/data/backups`);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const OUT_DIR = arg('--dir', path.join(DATA_DIR, 'backups-remote'));
const KEEP = Math.max(1, Number(arg('--keep', 30)) || 30);
const FRESH = !has('--no-fresh');
const TARGET = `${USER}@${HOST}`;

// BatchMode=yes：认证失败立刻退出，不弹交互式密码提示（cron/无人值守下不会卡死）
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new'];
if (KEY) SSH_OPTS.push('-o', 'IdentitiesOnly=yes', '-i', KEY);   // 指定密钥时只用它，避免轮试本机所有密钥触发 MaxAuthTries

const ssh = cmd => spawnSync('ssh', [...SSH_OPTS, TARGET, cmd], { encoding: 'utf8' });
const scp = (remote, local) => spawnSync('scp', [...SSH_OPTS, `${TARGET}:${remote}`, local], { encoding: 'utf8' });

// 校验拉回来的文件：能打开、完整、非空。坏备份留着比没有更危险。
function verify(p) {
  try {
    const db = new Database(p, { readonly: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
    let rows = 0;
    for (const t of tables) rows += db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    const users = tables.includes('users') ? db.prepare('SELECT COUNT(*) c FROM users').get().c : null;
    db.close();
    rm(`${p}-wal`); rm(`${p}-shm`);   // 若拉到的是 WAL 态旧备份，只读打开会留下空伴生文件，清掉
    if (integrity !== 'ok') return { ok: false, why: `完整性 ${integrity}` };
    if (!tables.length || !rows) return { ok: false, why: `内容为空（${tables.length} 表 / ${rows} 行）` };
    return { ok: true, tables: tables.length, rows, users, mb: (fs.statSync(p).size / 1048576).toFixed(2) };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

function pubkeyHint() {
  for (const n of ['id_ed25519.pub', 'id_rsa.pub']) {
    const p = path.join(os.homedir(), '.ssh', n);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return '<你的 ~/.ssh/id_ed25519.pub 内容>';
}

// 1) 连通性：先探一次，失败给可执行的修复指引，而不是抛一堆 ssh 报错
const probe = ssh('echo ok');
if (probe.status !== 0) {
  const err = (probe.stderr || '').trim();
  console.error(`✗ 连不上 ${TARGET}${KEY ? `（密钥 ${KEY}）` : ''}`);
  if (err) console.error(`  ${err.split('\n')[0]}`);
  if (/Permission denied/i.test(err)) {
    console.error('\n  本机公钥尚未被服务器授权。在云控制台的网页终端里执行一次（仅需一次）：');
    console.error(`    mkdir -p ~/.ssh && chmod 700 ~/.ssh`);
    console.error(`    echo "${pubkeyHint()}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`);
    console.error('\n  若服务器上的用户不是 root，用 --user 指定；若要用别的密钥，用 --key 指定。');
  }
  process.exit(1);
}

// 2) 让服务器先生成一份最新备份（--no-fresh 可跳过）
if (FRESH) {
  const r = ssh(`cd ${APP_DIR} && node scripts/backup-db.js`);
  if (r.status !== 0) {
    console.error('✗ 服务器生成新备份失败：', ((r.stderr || r.stdout) || '').trim().split('\n')[0]);
    console.error('  可加 --no-fresh 跳过此步，只拉取服务器上已有的备份');
    process.exit(1);
  }
  console.log('✓ 服务器已生成最新备份');
  (r.stdout || '').trim().split('\n').filter(Boolean).forEach(l => console.log(`  ${l}`));
}

// 3) 列远端备份，与本地比对（文件名即身份：含时间戳、内容不可变）
const ls = ssh(`ls -1 ${REMOTE_DIR}/app-*.db 2>/dev/null || true`);
const remote = (ls.stdout || '').split('\n').map(s => s.trim()).filter(s => /app-\d{8}-\d{6}\.db$/.test(s));
if (!remote.length) {
  console.error(`✗ 服务器 ${REMOTE_DIR} 下没有备份文件`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith('.part')) rm(path.join(OUT_DIR, f));   // 清理上次中断的残留
const local = new Set(fs.readdirSync(OUT_DIR).filter(f => /^app-\d{8}-\d{6}\.db$/.test(f)));
const todo = remote.filter(r => !local.has(path.basename(r)));
console.log(`\n远端 ${remote.length} 份 · 本地已有 ${local.size} 份 · 待拉取 ${todo.length} 份 → ${OUT_DIR}`);

// 4) 逐个拉取：先落 .part，校验通过才改名。
//    否则 scp 中断留下的半截文件会因文件名对得上而被永久当作「已拉取」跳过，那份备份就悄悄丢了。
let pulled = 0, failed = 0;
for (const rf of todo) {
  const name = path.basename(rf);
  const part = path.join(OUT_DIR, `${name}.part`);
  const r = scp(rf, part);
  if (r.status !== 0) {
    console.error(`  ✗ ${name} 拉取失败：${((r.stderr || '') + '').trim().split('\n')[0]}`);
    rm(part); failed++; continue;
  }
  const v = verify(part);
  if (!v.ok) {
    console.error(`  ✗ ${name} 校验未通过（${v.why}），已丢弃`);
    rmDb(part); failed++; continue;
  }
  fs.renameSync(part, path.join(OUT_DIR, name));
  console.log(`  ✓ ${name}  ${v.mb} MB · ${v.tables} 表 / ${v.rows} 行${v.users != null ? ` · users=${v.users}` : ''}`);
  pulled++;
}

// 5) 本地保留最近 KEEP 份
const all = fs.readdirSync(OUT_DIR).filter(f => /^app-\d{8}-\d{6}\.db$/.test(f)).sort().reverse();
const drop = all.slice(KEEP);
for (const f of drop) rmDb(path.join(OUT_DIR, f));

console.log(`\n${failed ? '⚠' : '✓'} 拉取完成：新增 ${pulled} 份${failed ? `，失败 ${failed} 份` : ''}`);
console.log(`  本地现存 ${all.length - drop.length} 份（上限 ${KEEP}）${drop.length ? `，已清理 ${drop.length} 份旧备份` : ''}`);
if (all.length - drop.length) console.log(`  最新：${all[0]}`);
process.exit(failed ? 1 : 0);
