// 全站行为：导航滚动收缩（>80px）+ 移动端抽屉。动效档位=少量点缀（DESIGN.md §9）。
(function () {
  var header = document.getElementById('site-header');
  var burger = document.getElementById('nav-burger');
  var drawer = document.getElementById('nav-drawer');

  if (header) {
    var shrunk = false;
    var onScroll = function () {
      var s = window.scrollY > 80;
      if (s !== shrunk) { shrunk = s; header.classList.toggle('shrunk', s); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // 入场动效：视口进入加 .in（一次性，前 3 个错峰 80ms）
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fades = document.querySelectorAll('.fade-up');
  if (reduce || !('IntersectionObserver' in window)) {
    fades.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        en.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    fades.forEach(function (el, i) {
      el.style.transitionDelay = (i % 3) * 80 + 'ms';
      io.observe(el);
    });
  }

  // 数字滚动：900ms 一次（§9），支持 2.500 / 2,500 / 15+ / 24h 混排
  var counts = document.querySelectorAll('.stat-v[data-count]');
  if (counts.length && !reduce && 'IntersectionObserver' in window) {
    var loc = document.documentElement.lang === 'en' ? 'en-US' : 'it-IT';
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io2.unobserve(en.target);
        var el = en.target, rawV = el.getAttribute('data-count');
        var m = rawV.match(/^([\d.,]+)(.*)$/);
        if (!m) return;
        var num = parseInt(m[1].replace(/[.,]/g, ''), 10);
        var suffix = m[2] || '';
        var hasSep = /[.,]/.test(m[1]);
        if (!isFinite(num)) return;
        var t0 = null;
        var step = function (ts) {
          if (!t0) t0 = ts;
          var p = Math.min(1, (ts - t0) / 900);
          var eased = 1 - Math.pow(1 - p, 3);
          var v = Math.round(num * eased);
          el.textContent = (hasSep ? v.toLocaleString(loc) : String(v)) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counts.forEach(function (el) { io2.observe(el); });
  }

  // [data-open-assistant] → 唤起右下角 AI 助手
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-open-assistant]');
    if (!btn) return;
    e.preventDefault();
    var fab = document.getElementById('assistant-fab');
    var panel = document.getElementById('assistant-panel');
    if (fab && (!panel || panel.hidden)) fab.click();
    var input = document.getElementById('assistant-input');
    if (input) input.focus();
  });

  if (burger && drawer) {
    var setOpen = function (open) {
      drawer.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.documentElement.classList.toggle('drawer-open', open);
    };
    burger.addEventListener('click', function () { setOpen(drawer.hidden); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
    });
  }
})();
