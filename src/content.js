// 站点文案键值层：注册表定义每个可编辑块（key/分组/标签/类型/默认值）。
// 默认值即设计稿文案——site_content 无记录时站点与原样完全一致；后台改哪条哪条生效。
// Convation 注册表在 ./registry.js（alan 遗留键已于 T3.5a 清除）。
const { db } = require('./db');
const { REGISTRY: CONVATION_REGISTRY } = require('./registry');



const REGISTRY = [...CONVATION_REGISTRY];

const byKey = new Map(REGISTRY.map(r => [r.key, r]));
const stGet = db.prepare('SELECT value FROM site_content WHERE key=?');
const stSet = db.prepare("INSERT INTO site_content(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at");
const stDel = db.prepare('DELETE FROM site_content WHERE key=?');

function raw(key) {
  const row = stGet.get(key);
  if (row && row.value !== '') return row.value;
  const def = byKey.get(key);
  return def ? def.def : '';
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
// 模板助手：ct=转义文本 ctBr=转义+换行转<br> ctImg=图片路径（仅站内路径）
const ct = key => esc(raw(key));
const ctBr = key => esc(raw(key)).replace(/\r?\n/g, '<br>');
function ctImg(key) {
  const v = raw(key);
  return /^\/(uploads|assets)\/[\w\-./]+$/.test(v) ? v : '';
}

function listForAdmin() {
  return REGISTRY.map(r => {
    const row = stGet.get(r.key);
    return { key: r.key, group: r.group, label: r.label, type: r.type, def: r.def, value: row ? row.value : '', overridden: !!row };
  });
}
function save(key, value) {
  if (!byKey.has(key)) throw new Error(`未知内容键：${key}`);
  const v = String(value);
  if (v.includes('�')) throw new Error('内容包含无效字符（编码损坏），已拒绝保存'); // 防脏字节入库
  if (v === '' || v === byKey.get(key).def) stDel.run(key); // 清空/等于默认 = 撤销覆盖
  else stSet.run(key, v);
}

// 本地化取值工厂：回退链 key.{locale} → key.it → key（未翻译退意语，旧键继续可用）
function ctFor(locale) {
  const rawL = key => {
    let v = raw(`${key}.${locale}`);
    if (v === '' && locale !== 'it') v = raw(`${key}.it`);
    if (v === '') v = raw(key);
    return v;
  };
  return {
    ct: key => esc(rawL(key)),
    ctBr: key => esc(rawL(key)).replace(/\r?\n/g, '<br>'),
    ctImg: key => { const v = rawL(key); return /^\/(uploads|assets)\/[\w\-./]+$/.test(v) ? v : ''; },
    raw: rawL, // 未转义原文（JSON-LD 等结构化输出用，禁止直接进 HTML）
  };
}

module.exports = { REGISTRY, raw, ct, ctBr, ctImg, ctFor, listForAdmin, save };
