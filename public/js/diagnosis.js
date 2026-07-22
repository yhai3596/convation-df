// 企业 AI 诊断问卷：5 题单选 → 企业信息 → 报告预览（与设计稿状态机一致，提交走真实后端）
(function () {
  var dataEl = document.getElementById('diagnosis-data');
  if (!dataEl) return;
  var QUESTIONS = JSON.parse(dataEl.textContent);
  var TOTAL = QUESTIONS.length + 1; // 5 题 + 收件信息 = 进度 n/6

  var state = { step: 0, answers: QUESTIONS.map(function () { return null; }), stage: 'quiz', company: '', email: '' };
  var started = false;

  var el = {
    stepLabel: document.getElementById('diag-step-label'),
    progress: document.getElementById('diag-progress'),
    quiz: document.getElementById('diag-quiz'),
    email: document.getElementById('diag-email'),
    done: document.getElementById('diag-done'),
    kicker: document.getElementById('diag-kicker'),
    title: document.getElementById('diag-title'),
    options: document.getElementById('diag-options'),
    back: document.getElementById('diag-back'),
    next: document.getElementById('diag-next'),
    backEmail: document.getElementById('diag-back-email'),
    submit: document.getElementById('diag-submit'),
    company: document.getElementById('diag-company'),
    emailInput: document.getElementById('diag-email-input'),
    error: document.getElementById('diag-error'),
  };

  function track(type, meta) { if (window.AlanTrack) AlanTrack.send(type, { meta: meta || '' }); }

  function render() {
    var isQuiz = state.stage === 'quiz';
    var isEmail = state.stage === 'email';
    var isDone = state.stage === 'done';
    el.quiz.hidden = !isQuiz;
    el.email.hidden = !isEmail;
    el.done.hidden = !isDone;

    var cur = isQuiz ? state.step + 1 : TOTAL;
    el.stepLabel.textContent = isDone ? '完成' : cur + ' / ' + TOTAL;
    el.progress.style.width = (isDone ? 100 : Math.round(cur / TOTAL * 100)) + '%';

    if (isQuiz) {
      var q = QUESTIONS[state.step];
      var picked = state.answers[state.step];
      el.kicker.textContent = q.kicker;
      el.title.textContent = q.title;
      el.options.innerHTML = '';
      q.options.forEach(function (label, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'diag-option' + (picked === i ? ' on' : '');
        var dot = document.createElement('span'); dot.className = 'diag-dot';
        var fill = document.createElement('i'); dot.appendChild(fill);
        btn.appendChild(dot);
        btn.appendChild(document.createTextNode(label));
        btn.addEventListener('click', function () {
          if (!started) { started = true; track('diagnosis_start'); }
          state.answers[state.step] = i;
          render();
        });
        el.options.appendChild(btn);
      });
      el.back.style.visibility = state.step === 0 ? 'hidden' : 'visible';
      el.next.disabled = picked === null;
      el.next.textContent = state.step === QUESTIONS.length - 1 ? '填写接收信息 →' : '下一题 →';
    }
  }

  el.back.addEventListener('click', function () { state.step = Math.max(0, state.step - 1); render(); });
  el.next.addEventListener('click', function () {
    if (state.answers[state.step] === null) return;
    track('diagnosis_step', 'q' + (state.step + 1));
    if (state.step === QUESTIONS.length - 1) { state.stage = 'email'; } else { state.step += 1; }
    render();
  });
  el.backEmail.addEventListener('click', function () { state.stage = 'quiz'; state.step = QUESTIONS.length - 1; render(); });

  el.submit.addEventListener('click', function () {
    var company = el.company.value.trim();
    var email = el.emailInput.value.trim();
    el.error.textContent = '';
    if (!company) { el.error.textContent = '请填写企业名称'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { el.error.textContent = '请填写有效的工作邮箱'; return; }

    el.submit.disabled = true;
    el.submit.textContent = 'Hermes Agent 生成中…';
    fetch('/api/diagnosis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: state.answers, company: company, email: email,
        sid: window.AlanTrack ? AlanTrack.sid : ''
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        el.submit.disabled = false;
        el.submit.textContent = '生成诊断报告 →';
        if (!res.ok) { el.error.textContent = res.d.error || '提交失败，请稍后再试'; return; }
        renderDone(company, email, res.d);
        state.stage = 'done';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        el.submit.disabled = false;
        el.submit.textContent = '生成诊断报告 →';
        el.error.textContent = '网络异常，请稍后再试';
      });
  });

  function renderDone(company, email, d) {
    document.getElementById('diag-done-company').textContent = company + ' · AI 诊断报告';
    document.getElementById('diag-done-sub').textContent = d.emailed
      ? ('完整报告已发送至 ' + email + ' · 由 Hermes Agent 生成，Alan 审核')
      : ('报告已生成并存档（提交邮箱：' + email + '）· 由 Hermes Agent 生成，Alan 审核后回访');
    document.getElementById('diag-level').textContent = d.level + ' / L5';
    document.getElementById('diag-spots').textContent = d.spots + ' 处';
    document.getElementById('diag-summary').textContent = d.summary;

    var spotsList = document.getElementById('diag-spots-list');
    spotsList.innerHTML = '';
    (d.integrationPoints || []).forEach(function (s, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:13.8px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--color-divider);font-size:14px';
      var no = document.createElement('span');
      no.style.cssText = "font-family:'Cormorant Garamond',serif;font-size:15px;color:var(--color-accent);font-feature-settings:'tnum' 1;min-width:28px";
      no.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
      row.appendChild(no);
      row.appendChild(document.createTextNode(s));
      spotsList.appendChild(row);
    });

    var stagesEl = document.getElementById('diag-stages');
    stagesEl.innerHTML = '';
    (d.stages || []).forEach(function (st) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:13.8px 0;border-bottom:1px solid var(--color-divider)';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;gap:13.8px;align-items:baseline;flex-wrap:wrap';
      var name = document.createElement('span');
      name.style.cssText = 'font-size:15px';
      name.textContent = st.name;
      var win = document.createElement('span');
      win.style.cssText = "font-size:12px;color:var(--color-neutral-600);font-feature-settings:'tnum' 1";
      win.textContent = st.window;
      head.appendChild(name); head.appendChild(win);
      var desc = document.createElement('p');
      desc.style.cssText = 'font-size:13.5px;line-height:24px;margin:6px 0 0;color:var(--color-neutral-700);text-align:justify';
      desc.textContent = st.desc + (st.note ? ' ' + st.note : '');
      row.appendChild(head); row.appendChild(desc);
      stagesEl.appendChild(row);
    });
  }

  document.getElementById('diag-restart').addEventListener('click', function () {
    state = { step: 0, answers: QUESTIONS.map(function () { return null; }), stage: 'quiz', company: '', email: '' };
    render();
    window.scrollTo({ top: 0 });
  });

  render();
})();
