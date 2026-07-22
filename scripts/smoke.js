// 冒烟测试：对运行中的实例做页面与 API 健康检查（用于部署后回归）
// 用法：node scripts/smoke.js [baseUrl]，默认 http://127.0.0.1:8201
const BASE = process.argv[2] || 'http://127.0.0.1:8201';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const pages = ['/', '/about', '/services', '/tools', '/blog', '/cases', '/courses', '/diagnosis', '/login'];
  for (const p of pages) {
    const r = await fetch(BASE + p).catch(() => null);
    check(`GET ${p}`, !!r && r.status === 200, r ? String(r.status) : 'no response');
  }
  const admin = await fetch(BASE + '/admin', { redirect: 'manual' }).catch(() => null);
  check('GET /admin 未登录跳转', !!admin && [301, 302, 303].includes(admin.status));

  const notFound = await fetch(BASE + '/definitely-not-a-page').catch(() => null);
  check('404 页面', !!notFound && notFound.status === 404);

  const diag = await fetch(BASE + '/api/diagnosis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: [1, 1, 0, 1, 0], company: '冒烟测试公司', email: 'smoke@test.local', sid: 'smoke' }),
  }).then(r => r.json()).catch(() => null);
  check('POST /api/diagnosis', !!diag && diag.ok && !!diag.level && Array.isArray(diag.integrationPoints), diag ? `level=${diag.level} spots=${diag.spots}` : '');

  const assist = await fetch(BASE + '/api/assistant', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '工具怎么用', sid: 'smoke' }),
  }).then(r => r.json()).catch(() => null);
  check('POST /api/assistant', !!assist && assist.ok && !!assist.reply, assist ? `via=${assist.via}` : '');

  const track = await fetch(BASE + '/api/track', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid: 'smoke', type: 'pageview', path: '/smoke' }),
  }).catch(() => null);
  check('POST /api/track', !!track && track.status === 204);

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR:', e.message); process.exit(1); });
