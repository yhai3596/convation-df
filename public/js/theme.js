// 全站主题：3 套配色 + Apple 风（设计稿 Assistant 组件逻辑的移植），localStorage 全站同步。
// 该脚本在 <head> 同步执行，避免主题闪烁。
(function () {
  var PALETTES = {
    '鎏金纸本': { accent: '#b68235', a700: '#7d5411', a600: '#a06f24', a300: '#facb8d', a100: '#fff3e4', bg: '#f3f2f2', surface: '#eae9e9' },
    '黛青石墨': { accent: '#41708f', a700: '#27495f', a600: '#345d7a', a300: '#a9c6da', a100: '#e9f1f7', bg: '#f1f3f4', surface: '#e7eaec' },
    '赭墨陶土': { accent: '#a35138', a700: '#6e311c', a600: '#8a4229', a300: '#e0aa93', a100: '#f9e9e2', bg: '#f4f1ee', surface: '#ece7e2' },
    '极简银白 · Apple风': { accent: '#0a68c4', a700: '#08488a', a600: '#0959a8', a300: '#9cc6ef', a100: '#eaf3fc', bg: '#fbfbfd', surface: '#f5f5f7', sans: true }
  };
  var KEY = 'alan-site-theme';
  var DEFAULT_NAME = '鎏金纸本';

  function apply(name) {
    if (!PALETTES[name]) name = DEFAULT_NAME;
    var p = PALETTES[name];
    var r = document.documentElement.style;
    r.setProperty('--color-accent', p.accent);
    r.setProperty('--color-accent-2', p.accent);
    r.setProperty('--color-accent-700', p.a700);
    r.setProperty('--color-accent-600', p.a600);
    r.setProperty('--color-accent-300', p.a300);
    r.setProperty('--color-accent-100', p.a100);
    r.setProperty('--color-accent-2-700', p.a700);
    r.setProperty('--color-accent-2-100', p.a100);
    r.setProperty('--color-bg', p.bg);
    r.setProperty('--color-surface', p.surface);
    try { localStorage.setItem(KEY, name); } catch (e) { /* 私隐模式 */ }

    var el = document.getElementById('theme-font-override');
    if (p.sans) {
      var css = 'body, body * { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Segoe UI", sans-serif !important; } body { letter-spacing: -0.01em; }';
      if (!el) { el = document.createElement('style'); el.id = 'theme-font-override'; document.head.appendChild(el); }
      el.textContent = css;
    } else if (el) { el.remove(); }

    var opts = document.querySelectorAll('[data-theme-opt]');
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute('data-theme-opt') === name;
      opts[i].classList.toggle('tag-accent', on);
      opts[i].classList.toggle('tag-outline', !on);
    }
  }
  function current() {
    try { return localStorage.getItem(KEY) || DEFAULT_NAME; } catch (e) { return DEFAULT_NAME; }
  }
  window.AlanTheme = { PALETTES: PALETTES, apply: apply, current: current };
  apply(current());
})();
