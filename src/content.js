// 站点文案键值层：注册表定义每个可编辑块（key/分组/标签/类型/默认值）。
// 默认值即设计稿文案——site_content 无记录时站点与原样完全一致；后台改哪条哪条生效。
const { db } = require('./db');

const T = 'text';
const TA = 'textarea';
const IMG = 'image';

const REGISTRY = [
  // —— 全站 ——
  { key: 'site.portrait', group: '全站', label: '人物照片（首页/关于/文章头像共用）', type: IMG, def: '/assets/alan.png' },

  // —— 首页 ——
  { key: 'home.hero_title', group: '首页', label: 'Hero 主标题（换行分行）', type: TA, def: '把 AI 真正用进制造业，\n从暖通行业开始。' },
  { key: 'home.hero_body', group: '首页', label: 'Hero 介绍段', type: TA, def: '我是 Alan——暖通行业 AI 专家，20 多年制造业从业经验，深耕 AI 与企业业务的落地融合。这里有我的在线工具、企业 AI 服务与课程，以及我正在持续写下的行业观察。' },
  { key: 'home.hero_note_en', group: '首页', label: 'Hero 英文注脚', type: T, def: 'Putting AI to real work in manufacturing — starting with HVAC.' },
  { key: 'home.stat1_value', group: '首页', label: '数字1 · 值', type: T, def: '20+' },
  { key: 'home.stat1_label', group: '首页', label: '数字1 · 说明', type: T, def: '年制造业从业经验 · Years' },
  { key: 'home.stat2_value', group: '首页', label: '数字2 · 值', type: T, def: '4' },
  { key: 'home.stat2_label', group: '首页', label: '数字2 · 说明', type: T, def: '款在线 AI 工具 · Tools' },
  { key: 'home.stat3_value', group: '首页', label: '数字3 · 值', type: T, def: '2' },
  { key: 'home.stat3_label', group: '首页', label: '数字3 · 说明', type: T, def: '种语言 中文 / English' },
  { key: 'home.stat4_value', group: '首页', label: '数字4 · 值', type: T, def: '1' },
  { key: 'home.stat4_label', group: '首页', label: '数字4 · 说明', type: T, def: '份免费企业 AI 诊断报告' },
  { key: 'home.pillar1_title', group: '首页', label: '板块1 · 标题', type: T, def: '工具集' },
  { key: 'home.pillar1_body', group: '首页', label: '板块1 · 介绍', type: TA, def: 'HVAC 选型工具、AHRI 竞品分析、北美市场竞品分析、专利 AI 辅助助手——为暖通从业者打造的在线工具，登录即用，持续上新。' },
  { key: 'home.pillar2_title', group: '首页', label: '板块2 · 标题', type: T, def: '企业 AI 服务' },
  { key: 'home.pillar2_body', group: '首页', label: '板块2 · 介绍', type: TA, def: '从 AI 现状诊断到结合点识别、推进路径设计。一份简单问卷，换一份可执行的 AI 诊断报告，帮企业把 AI 落到业务上。' },
  { key: 'home.pillar3_title', group: '首页', label: '板块3 · 标题', type: T, def: 'AI 课程' },
  { key: 'home.pillar3_body', group: '首页', label: '板块3 · 介绍', type: TA, def: '面向制造业与暖通行业的 AI 实战课程：不讲概念，讲怎么在你的岗位和业务里把 AI 用起来。部分课程已上线。' },
  { key: 'home.teaser_title', group: '首页', label: '诊断引导 · 标题（换行分行）', type: TA, def: '十分钟问卷，\n一份 AI 诊断报告。' },
  { key: 'home.teaser_body', group: '首页', label: '诊断引导 · 介绍', type: TA, def: '回答关于企业现状的一组问题，AI 生成诊断报告：你的 AI 成熟度、业务中的 AI 结合点、以及一条分阶段的推进路径。' },
  { key: 'home.contact_title', group: '首页', label: '底部联系 · 标题', type: T, def: '和我聊聊你的 AI 计划' },
  { key: 'home.contact_body', group: '首页', label: '底部联系 · 介绍', type: TA, def: '企业合作、课程咨询或只是交换想法——留下邮箱，我会回复。' },

  // —— 关于 ——
  { key: 'about.subtitle', group: '关于', label: '身份说明', type: T, def: '暖通行业 AI 专家 · 帮助企业 AI 应用落地' },
  { key: 'about.bio', group: '关于', label: '个人自述', type: TA, def: '20 多年制造业从业经验，深耕 AI 与企业业务的落地融合。我相信 AI 的价值不在演示里，而在流程里——在选型表、竞品库、专利稿和车间的日报里。这个网站是我的工作台：工具给同行用，服务给企业用，课程和文章给想把 AI 用起来的每一个人。' },
  { key: 'about.bio_en', group: '关于', label: '英文注脚', type: T, def: '20+ years in manufacturing. Making AI land in real business — starting with HVAC.' },
  { key: 'about.contact_email', group: '关于', label: '联系 · 邮箱', type: T, def: 'hello@alan-ai.example' },
  { key: 'about.contact_wechat', group: '关于', label: '联系 · 微信', type: T, def: 'alan_hvac_ai（占位）' },
  { key: 'about.contact_linkedin', group: '关于', label: '联系 · LinkedIn', type: T, def: '/in/alan-hvac-ai（占位）' },
  { key: 'about.contact_mp', group: '关于', label: '联系 · 公众号', type: T, def: 'Alan 的 AI 工作台（占位）' },
  { key: 'about.msg_title', group: '关于', label: '留言区 · 标题', type: T, def: '留言给我' },
  { key: 'about.msg_body', group: '关于', label: '留言区 · 说明', type: TA, def: '企业合作、课程咨询、工具反馈，或任何想聊的话题。' },

  // —— 企业AI服务 ——
  { key: 'services.hero_title', group: '企业AI服务', label: 'Hero 标题（换行分行）', type: TA, def: 'AI 不该停在演示里，\n它该进你的业务流程。' },
  { key: 'services.hero_body', group: '企业AI服务', label: 'Hero 介绍', type: TA, def: '我帮制造业企业回答三个问题：现在在哪里、AI 能接在哪里、下一步怎么走。从一份免费的 AI 诊断报告开始。' },
  { key: 'services.step1_title', group: '企业AI服务', label: '三步 · 1 标题', type: T, def: '填写问卷' },
  { key: 'services.step1_body', group: '企业AI服务', label: '三步 · 1 说明', type: TA, def: '约 10 分钟，围绕业务现状、数据基础、团队能力与目标的一组问题。不需要任何技术背景。' },
  { key: 'services.step2_title', group: '企业AI服务', label: '三步 · 2 标题', type: T, def: 'AI 生成诊断报告' },
  { key: 'services.step2_body', group: '企业AI服务', label: '三步 · 2 说明', type: TA, def: '报告包含：AI 成熟度评估、业务中的 AI 结合点清单、按优先级排列的推进路径。' },
  { key: 'services.step3_title', group: '企业AI服务', label: '三步 · 3 标题', type: T, def: '一对一解读' },
  { key: 'services.step3_body', group: '企业AI服务', label: '三步 · 3 说明', type: TA, def: '预约一次解读沟通，把报告翻译成你企业里可以立刻启动的第一步。' },
  { key: 'services.svc1_title', group: '企业AI服务', label: '服务1 · 名称', type: T, def: 'AI 现状诊断' },
  { key: 'services.svc1_desc', group: '企业AI服务', label: '服务1 · 说明', type: TA, def: '问卷 + AI 生成报告 + 解读沟通，评估企业 AI 成熟度与切入点。' },
  { key: 'services.svc2_title', group: '企业AI服务', label: '服务2 · 名称', type: T, def: 'AI 落地咨询' },
  { key: 'services.svc2_desc', group: '企业AI服务', label: '服务2 · 说明', type: TA, def: '结合点识别、方案设计、供应商与工具选型，陪企业走完从 0 到 1。' },
  { key: 'services.svc3_title', group: '企业AI服务', label: '服务3 · 名称', type: T, def: '企业内训' },
  { key: 'services.svc3_desc', group: '企业AI服务', label: '服务3 · 说明', type: TA, def: '面向管理层与业务团队的 AI 应用工作坊，以企业自己的业务为案例。' },

  // —— 案例·培训 ——
  { key: 'cases.hero_title', group: '案例培训', label: 'Hero 标题（换行分行）', type: TA, def: '做过的事，\n比说过的话更可信。' },
  { key: 'cases.hero_body', group: '案例培训', label: 'Hero 介绍', type: TA, def: '企业 AI 落地项目与培训现场的记录。案例细节经客户同意后公开，部分做了脱敏处理。' },
  { key: 'cases.training1_img', group: '案例培训', label: '培训照片 1', type: IMG, def: '' },
  { key: 'cases.training1_caption', group: '案例培训', label: '培训照片 1 · 说明', type: T, def: '企业 AI 应用工作坊 · 2026.05' },
  { key: 'cases.training2_img', group: '案例培训', label: '培训照片 2', type: IMG, def: '' },
  { key: 'cases.training2_caption', group: '案例培训', label: '培训照片 2 · 说明', type: T, def: '管理层 AI 认知课 · 2026.04' },
  { key: 'cases.training3_img', group: '案例培训', label: '培训照片 3', type: IMG, def: '' },
  { key: 'cases.training3_caption', group: '案例培训', label: '培训照片 3 · 说明', type: T, def: '行业协会分享 · 2026.03' },
  { key: 'cases.stat1_value', group: '案例培训', label: '数字1 · 值', type: T, def: '30+' },
  { key: 'cases.stat1_label', group: '案例培训', label: '数字1 · 说明', type: T, def: '场企业培训与分享' },
  { key: 'cases.stat2_value', group: '案例培训', label: '数字2 · 值', type: T, def: '1,200+' },
  { key: 'cases.stat2_label', group: '案例培训', label: '数字2 · 说明', type: T, def: '参训学员' },
  { key: 'cases.stat3_value', group: '案例培训', label: '数字3 · 值', type: T, def: '4.8' },
  { key: 'cases.stat3_label', group: '案例培训', label: '数字3 · 说明', type: T, def: '平均满意度 / 5' },

  // —— 课程 / 工具 / 博客 / 诊断 ——
  { key: 'courses.hero_title', group: '课程', label: 'Hero 标题（换行分行）', type: TA, def: '不讲概念，\n讲怎么把 AI 用起来。' },
  { key: 'courses.hero_body', group: '课程', label: 'Hero 介绍', type: TA, def: '面向制造业与暖通行业从业者的实战课程。注册登录后可购买与学习。' },
  { key: 'tools.hero_title', group: '工具集', label: 'Hero 标题（换行分行）', type: TA, def: '为暖通行业打造的\nAI 工具台。' },
  { key: 'tools.hero_body', group: '工具集', label: 'Hero 介绍', type: TA, def: '每一件工具都来自真实的工作场景。注册登录后即可在线使用；工具会持续增加。' },
  { key: 'tools.more_title', group: '工具集', label: '"更多工具"卡片标题', type: T, def: '更多工具正在路上' },
  { key: 'blog.hero_title', group: '博客', label: 'Hero 标题', type: T, def: '行业观察与工作笔记。' },
  { key: 'blog.subscribe_note', group: '博客', label: '订阅卡说明', type: TA, def: '新文章与工具上新，直接进你的邮箱。不发广告。' },
  { key: 'blog.writing_note', group: '博客', label: '"写作方式"说明', type: TA, def: '文章由我本人撰写，AI 工具辅助整理与配图。观点是我的，错误也是。' },
  { key: 'diagnosis.note', group: '诊断', label: '页头说明（邮件未配置时自动追加回访措辞）', type: T, def: '约 10 分钟 · 完成后由 Hermes Agent 生成诊断报告' },
];

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

module.exports = { REGISTRY, raw, ct, ctBr, ctImg, listForAdmin, save };
