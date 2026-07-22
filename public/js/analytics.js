// 前端埋点：pageview / data-track 点击 / 文章完读
// 同意闸门（CMP T4.3）：localStorage cv-consent.analytics=true 才建 sid、才发包；
// 拒绝或未表态 = 零存储零请求；同意事件（cv-consent-changed）到达即启动并补发当页 pageview。
(function () {
  function allowed() {
    try { var c = JSON.parse(localStorage.getItem('cv-consent') || 'null'); return !!(c && c.analytics); } catch (e) { return false; }
  }
  function makeSid() {
    try {
      var s = localStorage.getItem('cv-sid');
      if (!s) {
        s = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + '-' + Date.now();
        localStorage.setItem('cv-sid', s);
      }
      return s;
    } catch (e) { return 'anon'; }
  }

  var api = { sid: '', send: send };
  window.AlanTrack = api; // 站内脚本沿用此全局名（login/assistant/表单读 .sid，带空值守卫）

  function send(type, extra) {
    if (!allowed()) return;
    if (!api.sid) api.sid = makeSid();
    var payload = { sid: api.sid, type: type, path: location.pathname, ref: document.referrer || '' };
    if (extra) for (var k in extra) payload[k] = extra[k];
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
      }
    } catch (e) { /* 忽略埋点失败 */ }
  }

  var pvSent = false;
  function pageview() { if (!pvSent && allowed()) { pvSent = true; send('pageview'); } }
  pageview();
  window.addEventListener('cv-consent-changed', function () {
    if (!allowed()) { api.sid = ''; return; } // 撤回：丢弃会话标识（cv-sid 已由横幅删除）
    pageview();
  });

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-track]') : null;
    if (!el) return;
    send(el.getAttribute('data-track'), { meta: el.getAttribute('data-track-meta') || '' });
  });

  // 文章完读：底部哨兵进入视口即记一次
  var end = document.getElementById('article-end');
  if (end && 'IntersectionObserver' in window) {
    var slug = end.getAttribute('data-slug');
    var sent = false;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting && !sent) {
          sent = true;
          send('read_complete', { meta: slug });
          io.disconnect();
        }
      }
    });
    io.observe(end);
  }
})();
