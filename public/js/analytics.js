// 前端埋点：pageview / data-track 点击 / 文章完读
(function () {
  function makeSid() {
    try {
      var s = localStorage.getItem('alan-sid');
      if (!s) {
        s = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2) + '-' + Date.now();
        localStorage.setItem('alan-sid', s);
      }
      return s;
    } catch (e) { return 'anon'; }
  }
  var SID = makeSid();

  function send(type, extra) {
    var payload = { sid: SID, type: type, path: location.pathname, ref: document.referrer || '' };
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
  window.AlanTrack = { send: send, sid: SID };

  send('pageview');

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
