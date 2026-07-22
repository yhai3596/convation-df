// 重置/设置管理员密码为你指定的值（忘记密码时用）。
// 用法：node scripts/set-admin-password.js "你的新密码" [管理员邮箱]
//   不给邮箱则改第一个 admin 账号。可在本机或服务器控制台运行，改完即时生效（无需重启）。
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');

const pw = process.argv[2];
const email = process.argv[3];

if (!pw || pw.length < 8) {
  console.error('请提供至少 8 位的新密码：node scripts/set-admin-password.js "新密码" [邮箱]');
  process.exit(1);
}

const admin = email
  ? db.prepare("SELECT id, email FROM users WHERE email=? AND role='admin'").get(email.toLowerCase())
  : db.prepare("SELECT id, email FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();

if (!admin) {
  console.error(email ? `未找到管理员：${email}` : '库中没有管理员账号');
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pw, 10), admin.id);
console.log(`✓ 已重置管理员密码：${admin.email}`);
console.log('  现在即可用新密码登录 /admin（无需重启服务）。');
