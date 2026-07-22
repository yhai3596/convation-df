// LLM 客户端：多 provider + 故障自动切换。
// 调用时按后台配置的顺序依次尝试启用的 provider，失败（网络/HTTP/空响应）自动切下一个，全挂才报错。
// 每个 provider 按 Base URL 自动识别端点：
//   - OpenAI 兼容（默认）：{base}/chat/completions，Bearer 鉴权，解析 choices[0].message.content
//   - Anthropic 兼容（base 含 "anthropic"）：{base}/v1/messages，x-api-key 鉴权，解析 content[].text
// 未配置任何 provider 时诊断报告/助手/自动回复走内置模板与 FAQ，功能完整可用。
const { activeProviders, logActivity } = require('./config');

function enabled() { return activeProviders().length > 0; }
function modelName() { const p = activeProviders()[0]; return p ? p.model : ''; }
function isAnthropic(base) { return /anthropic/i.test(base); }

// OpenAI 的 [{role:system},{role:user}] → Anthropic 的 {system, messages}
function toAnthropic(messages) {
  let system = '';
  const msgs = [];
  for (const m of messages) {
    if (m.role === 'system') system += (system ? '\n\n' : '') + m.content;
    else msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  if (!msgs.length) msgs.push({ role: 'user', content: system || 'hi' });
  return { system, messages: msgs };
}

// 单个 provider 调用
async function callProvider(p, messages, { maxTokens = 800, timeoutMs = 15000, json = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let url, headers, body, extractText;
    if (isAnthropic(p.base)) {
      const { system, messages: amsgs } = toAnthropic(messages);
      url = `${p.base}/v1/messages`;
      headers = { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01', Authorization: `Bearer ${p.key}` };
      body = { model: p.model, max_tokens: maxTokens, temperature: 0.5, messages: amsgs };
      if (system) body.system = system;
      extractText = data => Array.isArray(data.content) ? data.content.filter(b => b.type === 'text').map(b => b.text).join('') : null;
    } else {
      url = `${p.base}/chat/completions`;
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
      body = { model: p.model, messages, max_tokens: maxTokens, temperature: 0.5, ...(json ? { response_format: { type: 'json_object' } } : {}) };
      extractText = data => data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 300);
      try { const j = JSON.parse(raw); detail = (j.error && (j.error.message || j.error)) || j.message || detail; } catch (_) { /* raw */ }
      throw new Error(`HTTP ${res.status} · ${detail}`);
    }
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error(`响应非 JSON：${raw.slice(0, 160)}`); }
    const text = extractText(data);
    if (!text) throw new Error(`空响应（端点/模型可能不匹配）：${raw.slice(0, 160)}`);
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// 故障切换：按序尝试每个启用的 provider
async function chat(messages, opts = {}) {
  const providers = activeProviders();
  if (!providers.length) throw new Error('LLM not configured');
  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const out = await callProvider(p, messages, opts);
      if (i > 0) logActivity('system:llm', 'llm_failover', p.name, `前 ${i} 个失败，切到「${p.name}」成功`, true);
      return out;
    } catch (e) {
      errors.push(`「${p.name}」${e.message}`);
      if (providers.length > 1) logActivity('system:llm', 'llm_error', p.name, e.message.slice(0, 120), false);
    }
  }
  throw new Error('所有 LLM 均失败：' + errors.join(' ｜ '));
}

// 后台"测试连接"：测指定 provider（传 {base,model,key}），或第一个可用的
async function testConnection(override) {
  const p = override && override.key && override.base ? override : activeProviders()[0];
  if (!p) return { ok: false, error: '未配置任何可用 LLM' };
  const t0 = Date.now();
  try {
    const reply = await callProvider(p, [{ role: 'user', content: '只回复两个字：正常' }], { maxTokens: 16, timeoutMs: 12000 });
    return { ok: true, name: p.name, model: p.model, endpoint: isAnthropic(p.base) ? 'anthropic' : 'openai', latencyMs: Date.now() - t0, reply: reply.slice(0, 20) };
  } catch (e) {
    return { ok: false, name: p.name, model: p.model, endpoint: isAnthropic(p.base) ? 'anthropic' : 'openai', latencyMs: Date.now() - t0, error: e.message };
  }
}

// 从可能带 markdown 代码围栏的输出中提取 JSON
function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in LLM output');
  return JSON.parse(m[0]);
}

module.exports = { enabled, chat, parseJson, testConnection, modelName };
