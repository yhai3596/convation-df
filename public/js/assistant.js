// 悬浮智能客户助手（全站挂载）：开合对话、快捷问题、主题切换、调用 /api/assistant
(function () {
  var root = document.getElementById('assistant-root');
  if (!root) return;
  var panel = document.getElementById('assistant-panel');
  var fab = document.getElementById('assistant-fab');
  var msgsEl = document.getElementById('assistant-msgs');
  var input = document.getElementById('assistant-input');
  var sendBtn = document.getElementById('assistant-send');
  var greeted = false;

  function bubble(from, text) {
    var wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.justifyContent = from === 'me' ? 'flex-end' : 'flex-start';
    var b = document.createElement('div');
    b.style.cssText = 'max-width:85%;padding:9.2px 13.8px;font-size:13.5px;line-height:22px;border-radius:var(--radius-md);border:1px solid ' +
      (from === 'me' ? 'var(--color-accent)' : 'var(--color-divider)') +
      ';background:' + (from === 'me' ? 'var(--color-accent-100)' : 'transparent');
    b.textContent = text;
    wrap.appendChild(b);
    msgsEl.appendChild(wrap);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return b;
  }

  function toggle() {
    var open = panel.hasAttribute('hidden');
    if (open) {
      panel.removeAttribute('hidden');
      if (!greeted) {
        greeted = true;
        bubble('ai', '你好，我是 Alan 的智能客户助手。可以帮你了解工具、课程，或预约企业 AI 诊断。');
      }
      if (input) input.focus();
    } else {
      panel.setAttribute('hidden', '');
    }
  }
  fab.addEventListener('click', toggle);
  var closeBtn = document.getElementById('assistant-close');
  if (closeBtn) closeBtn.addEventListener('click', toggle);

  var busy = false;
  function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    bubble('me', text);
    var typing = bubble('ai', '正在输入…');
    fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sid: window.AlanTrack ? AlanTrack.sid : '', path: location.pathname })
    }).then(function (r) { return r.json(); }).then(function (d) {
      typing.textContent = d.reply || d.error || '抱歉，出了点问题，请稍后再试。';
      busy = false;
    }).catch(function () {
      typing.textContent = '网络异常，请稍后再试。';
      busy = false;
    });
  }

  root.addEventListener('click', function (e) {
    var q = e.target.closest ? e.target.closest('[data-quick]') : null;
    if (q) { ask(q.getAttribute('data-quick')); return; }
    var t = e.target.closest ? e.target.closest('[data-theme-opt]') : null;
    if (t && window.AlanTheme) { AlanTheme.apply(t.getAttribute('data-theme-opt')); }
  });

  function sendDraft() { var v = input.value; input.value = ''; ask(v); }
  if (sendBtn) sendBtn.addEventListener('click', sendDraft);
  if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendDraft(); });

  // 同步主题选中态
  if (window.AlanTheme) AlanTheme.apply(AlanTheme.current());
})();

// 轻提示
window.alanToast = function (text, ms) {
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, ms || 3200);
};

// 退出登录
(function () {
  var btn = document.getElementById('nav-logout');
  if (!btn) return;
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/auth/logout', { method: 'POST' }).then(function () { location.href = '/'; });
  });
})();
