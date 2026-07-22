// 运行时配置层：settings 表优先，.env 兜底。
// 管理后台改配置即时生效（无需重启）；密钥只存服务端，前端仅见脱敏形态。
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');

// —— LLM 多 provider 配置（数组顺序 = 故障切换优先级）——
// 每个 provider：{ id, name, base, model, key, enabled }
function _legacyProvider() {
  const key = getSetting('llm_api_key') || process.env.Z_AI_API_KEY || process.env.LLM_API_KEY || '';
  if (!key) return null;
  return {
    id: 'legacy', name: '默认',
    base: (getSetting('llm_base_url') || process.env.LLM_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/$/, ''),
    model: getSetting('llm_model') || process.env.LLM_MODEL || 'glm-4.5-flash',
    key, enabled: true,
  };
}
function _normalize(p) {
  return {
    id: String(p.id || ''), name: String(p.name || '未命名'),
    base: String(p.base || '').replace(/\/$/, ''), model: String(p.model || ''),
    key: String(p.key || ''), enabled: p.enabled !== false,
  };
}
function _persist(list) { setSetting('llm_providers', JSON.stringify(list)); }
function llmProviders() {
  let list = null;
  try { const raw = getSetting('llm_providers'); if (raw) list = JSON.parse(raw); } catch (_) { /* fall through */ }
  if (Array.isArray(list)) return list.map(_normalize);
  // 首次：把旧的单 provider 配置一次性迁移成列表，迁移后清空旧键（避免下次重复迁移/歧义）
  const lg = _legacyProvider();
  if (lg) {
    const migrated = [_normalize({ id: crypto.randomBytes(5).toString('hex'), name: lg.name, base: lg.base, model: lg.model, key: lg.key, enabled: true })];
    _persist(migrated);
    setSetting('llm_api_key', ''); setSetting('llm_base_url', ''); setSetting('llm_model', '');
    return migrated;
  }
  return [];
}
// 启用且配置完整的 provider（按序），供故障切换
function activeProviders() { return llmProviders().filter(p => p.enabled && p.key && p.base && p.model); }

// 新增或更新一个 provider（key 传空=保留原 key）
function saveProvider(p) {
  const list = llmProviders();
  const base = String(p.base || '').trim().replace(/\/$/, '');
  const model = String(p.model || '').trim();
  const name = String(p.name || '').trim().slice(0, 30) || '未命名';
  if (base && !/^https?:\/\//.test(base)) throw new Error('Base URL 需以 http(s):// 开头');
  const idx = p.id ? list.findIndex(x => x.id === p.id) : -1;
  if (idx >= 0) {
    const key = String(p.key || '').trim();
    list[idx] = { id: list[idx].id, name, base, model, key: key || list[idx].key, enabled: p.enabled !== false };
  } else {
    list.push({ id: crypto.randomBytes(5).toString('hex'), name, base, model, key: String(p.key || '').trim(), enabled: p.enabled !== false });
  }
  _persist(list);
  // 迁移：写入 providers 后清空旧的单 provider 键，避免歧义
  setSetting('llm_api_key', ''); setSetting('llm_base_url', ''); setSetting('llm_model', '');
  return list;
}
function deleteProvider(id) { _persist(llmProviders().filter(x => x.id !== id)); }
function reorderProviders(ids) {
  const map = {}; llmProviders().forEach(p => { map[p.id] = p; });
  const ordered = ids.map(id => map[id]).filter(Boolean);
  Object.keys(map).forEach(id => { if (ids.indexOf(id) < 0) ordered.push(map[id]); });
  _persist(ordered);
}
function toggleProvider(id, enabled) {
  const list = llmProviders();
  const p = list.find(x => x.id === id); if (p) { p.enabled = !!enabled; _persist(list); }
}

// 兼容旧调用：返回第一个可用 provider（或默认空壳）
function llmConfig() {
  const p = activeProviders()[0];
  return p ? { key: p.key, base: p.base, model: p.model } : { key: '', base: 'https://api.z.ai/api/paas/v4', model: 'glm-4.5-flash' };
}
function maskKey(key) {
  if (!key) return '';
  return key.length <= 8 ? '****' : key.slice(0, 4) + '****' + key.slice(-4);
}
// 供后台展示：provider 列表（key 脱敏）
function llmProvidersView() {
  return llmProviders().map(p => ({ id: p.id, name: p.name, base: p.base, model: p.model, keyMasked: maskKey(p.key), enabled: p.enabled }));
}

// —— Agent 模式 ——
function agentModes() {
  return {
    autoreply: getSetting('agent_autoreply', '1') === '1',          // 评论自动回复（自动上线）
    contentReview: getSetting('agent_content_review', '1') === '1', // Agent/AI 内容先入草稿待审
    scanIntervalMin: Math.max(1, Math.min(120, Number(getSetting('agent_scan_interval_min', '5')) || 5)),
  };
}
function saveAgentModes({ autoreply, contentReview, scanIntervalMin }) {
  if (autoreply !== undefined) setSetting('agent_autoreply', autoreply ? '1' : '0');
  if (contentReview !== undefined) setSetting('agent_content_review', contentReview ? '1' : '0');
  if (scanIntervalMin !== undefined) setSetting('agent_scan_interval_min', String(Math.max(1, Math.min(120, Number(scanIntervalMin) || 5))));
}

// —— Agent 活动日志（自动化的可观测底座） ——
const insActivity = db.prepare('INSERT INTO agent_activity(actor,action,target,detail,ok) VALUES (?,?,?,?,?)');
function logActivity(actor, action, target = '', detail = '', ok = true) {
  try {
    insActivity.run(String(actor).slice(0, 40), String(action).slice(0, 40),
      String(target).slice(0, 120), String(detail).slice(0, 300), ok ? 1 : 0);
  } catch (_) { /* 日志失败不影响主流程 */ }
}
function recentActivity(limit = 30) {
  return db.prepare('SELECT * FROM agent_activity ORDER BY id DESC LIMIT ?').all(Math.min(200, limit));
}

module.exports = {
  llmConfig, maskKey, agentModes, saveAgentModes, logActivity, recentActivity,
  llmProviders, activeProviders, saveProvider, deleteProvider, reorderProviders, toggleProvider, llmProvidersView,
};
