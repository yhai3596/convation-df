// 企业 AI 诊断报告生成器（Hermes Agent 职责）：
// 基础评估为确定性规则（与设计稿口径一致），配置 LLM 后自动增强摘要与阶段说明，失败无感回退。
// 知识库（结合点/阶段模板/基础评语/成熟度映射）后台可编辑：settings.diagnosis_kb 优先，内置默认兜底。
const llm = require('./llm');
const { getSetting } = require('./db');

const QUESTIONS = [
  { kicker: '第 1 题 · 业务现状', title: '贵司目前的数字化基础处于什么阶段？', options: ['纸质/Excel 为主', '有 ERP，但数据分散', 'ERP + MES 等系统较完整', '已有数据平台与分析团队'] },
  { kicker: '第 2 题 · AI 现状', title: '目前 AI 在贵司的使用情况？', options: ['还没用过', '个别员工自发使用 ChatGPT 等', '有部门级试点', '已有 AI 进入正式流程'] },
  { kicker: '第 3 题 · 业务痛点', title: '当前最想改善的业务环节是？', options: ['市场与竞品情报', '研发与专利', '生产与质检', '销售与客服'] },
  { kicker: '第 4 题 · 团队', title: '团队对 AI 的态度更接近哪种？', options: ['观望，担心替代', '有兴趣，缺方法', '积极，已在自学', '管理层强力推动'] },
  { kicker: '第 5 题 · 目标', title: '未来 12 个月希望 AI 带来什么？', options: ['降本增效', '新产品/新能力', '团队 AI 技能建设', '还不确定，想先看清楚'] },
];

// 各业务痛点方向的 AI 结合点知识库（按优先级排列，报告取前 N 项）
const SPOT_LIBRARY = {
  '市场与竞品情报': [
    '竞品参数库自动采集与清洗（AHRI/官网/渠道价目）',
    '竞品对比周报自动生成与推送',
    '市场舆情与新品发布监测摘要',
    '招投标信息抽取与匹配提醒',
    '渠道价格异动监测与归因',
    '客户询盘意图分类与线索打分',
    '展会/行业报告的要点提炼入库',
    '竞品专利动态跟踪简报',
    '细分市场容量估算辅助',
    '销售话术中的竞品应对卡片生成',
    '管理层月度市场简报自动汇编',
  ],
  '研发与专利': [
    '专利检索式生成与查全率复核',
    '现有技术（Prior Art）对比表自动化',
    '交底书初稿生成与要点核对',
    '竞品专利布局地图与预警',
    '试验报告结构化归档与检索问答',
    '标准/法规条款变更监测摘要',
    '选型计算书的 AI 复核',
    '研发例会纪要与行动项跟踪',
    '仿真结果的批量后处理摘要',
    '技术文档翻译与术语一致性检查',
    '失效模式知识库问答（FMEA 辅助）',
  ],
  '生产与质检': [
    '质检记录数字化与缺陷分类统计',
    '产线日报/异常报告自动汇总',
    '售后故障工单聚类与根因线索',
    '8D/CAPA 报告初稿辅助生成',
    '设备点检记录异常筛查',
    '来料检验标准问答助手',
    '工艺文件版本比对与差异提示',
    '产线视觉抽检试点（单工位）',
    '备件库存呆滞分析与预警',
    '安全巡检记录合规性检查',
    '车间班组培训问答机器人',
  ],
  '销售与客服': [
    '客服常见问题自动回复（知识库问答）',
    '询盘/报价邮件的要素抽取与草拟',
    '客户拜访纪要结构化与跟进提醒',
    'CRM 数据清洗与线索评分',
    '投标文件初稿与合规性自查',
    '售后工单分流与优先级判定',
    '销售周报自动汇总',
    '多语言产品资料生成（出海场景）',
    '经销商培训材料与考核题生成',
    '客户流失风险预警清单',
    '合同关键条款比对提示',
  ],
};

const FOUNDATION_NOTES = [
  '贵司目前以纸质/Excel 为主，建议边试点边补齐关键数据的电子化底座',
  '贵司已有 ERP 基础、数据尚分散，具备从单点场景切入的条件',
  '贵司 ERP+MES 等系统基础较完整，具备直接开展流程级 AI 试点的条件',
  '贵司已有数据平台与分析团队，可以并行推进多个 AI 场景',
];

const LEVEL_BY_AI_STATUS = ['L1', 'L1', 'L2', 'L3'];
const LEVEL_DESC = {
  L1: '尚未系统性使用 AI，处于认知与准备期',
  L2: '已有部门级试点，尚未进入正式业务流程',
  L3: 'AI 已进入部分正式流程，具备扩面条件',
};

// 阶段模板（{focus}/{goal} 为占位符，按问卷答案代入）
const STAGE_TEMPLATES = [
  { name: '阶段一 · 快速试点', window: '0–3 个月', desc: '围绕「{focus}」选定 1 个高频场景，用成熟 AI 工具搭建最小可用流程，拿到第一批可量化结果。' },
  { name: '阶段二 · 扩面与流程改造', window: '3–6 个月', desc: '把试点沉淀为标准流程（SOP），在业务流程中为 AI 让出明确位置，扩展到相邻环节并建立数据回流。' },
  { name: '阶段三 · 能力内化', window: '6–12 个月', desc: '开展岗位化 AI 技能培训，把外部方案转为内部能力，建立效果度量与治理机制，服务于「{goal}」的年度目标。' },
];

const SUMMARY_TEMPLATE = '{foundation}。建议从「{focus}」切入，以 3 个月试点建立第一个 AI 落地场景，同步开展团队 AI 技能培训，再分阶段推广到相邻环节。完整报告含 {spots} 处 AI 结合点清单与三阶段路线图。';

const DEFAULT_KB = {
  spotLibrary: SPOT_LIBRARY,
  foundationNotes: FOUNDATION_NOTES,
  levelByAiStatus: LEVEL_BY_AI_STATUS,
  levelDesc: LEVEL_DESC,
  stageTemplates: STAGE_TEMPLATES,
  summaryTemplate: SUMMARY_TEMPLATE,
};

// 读取知识库：后台保存的 settings.diagnosis_kb 优先，字段级回退到内置默认
function getKB() {
  const kb = { ...DEFAULT_KB };
  try {
    const saved = JSON.parse(getSetting('diagnosis_kb') || 'null');
    if (saved && typeof saved === 'object') {
      for (const domain of QUESTIONS[2].options) {
        if (Array.isArray(saved.spotLibrary && saved.spotLibrary[domain]) && saved.spotLibrary[domain].length >= 5) {
          kb.spotLibrary = { ...kb.spotLibrary, [domain]: saved.spotLibrary[domain].map(String) };
        }
      }
      if (Array.isArray(saved.foundationNotes) && saved.foundationNotes.length === 4) kb.foundationNotes = saved.foundationNotes.map(String);
      if (Array.isArray(saved.stageTemplates) && saved.stageTemplates.length === 3 &&
          saved.stageTemplates.every(s => s && s.name && s.window && s.desc)) {
        kb.stageTemplates = saved.stageTemplates.map(s => ({ name: String(s.name), window: String(s.window), desc: String(s.desc) }));
      }
      if (typeof saved.summaryTemplate === 'string' && saved.summaryTemplate.includes('{focus}')) kb.summaryTemplate = saved.summaryTemplate;
      if (saved.levelDesc && typeof saved.levelDesc === 'object') kb.levelDesc = { ...kb.levelDesc, ...saved.levelDesc };
    }
  } catch (e) {
    console.warn('[report] diagnosis_kb 解析失败，使用内置默认：', e.message);
  }
  return kb;
}

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));

function baseReport(answers) {
  const kb = getKB();
  const [a0, a1, a2, a3, a4] = answers;
  const focus = QUESTIONS[2].options[a2];
  const level = kb.levelByAiStatus[a1] || 'L1';
  const lib = kb.spotLibrary[focus] || kb.spotLibrary['市场与竞品情报'];
  const spots = Math.min(5 + a0 + a3, lib.length);
  const goal = QUESTIONS[4].options[a4];

  const vars = { focus, goal, spots, foundation: kb.foundationNotes[a0] };
  const stages = kb.stageTemplates.map((s, i) => ({
    name: s.name,
    window: s.window,
    desc: fill(s.desc, vars) + (i === 0 && a0 === 0 ? '（同步补齐该场景所需数据的电子化。）' : ''),
  }));

  const summary = fill(kb.summaryTemplate, vars);

  return {
    level, levelDesc: kb.levelDesc[level] || '', spots, focus, goal,
    integrationPoints: lib.slice(0, spots),
    stages, summary,
    answersText: answers.map((a, i) => `${QUESTIONS[i].title} → ${QUESTIONS[i].options[a]}`),
  };
}

async function generate(answers, company) {
  const report = baseReport(answers);
  let generator = 'template';
  if (llm.enabled()) {
    try {
      const text = await llm.chat([
        {
          role: 'system',
          content: '你是 Hermes Agent，暖通行业 AI 专家 Alan 的企业 AI 诊断助手。根据企业问卷答案撰写诊断摘要。语气专业克制、面向制造业管理层，不夸大。只输出 JSON 对象，格式：{"summary":"140-200字的诊断摘要","stage_notes":["阶段一一句话建议","阶段二一句话建议","阶段三一句话建议"]}',
        },
        {
          role: 'user',
          content: `企业名称：${company || '（未提供）'}\n问卷结果：\n${report.answersText.join('\n')}\n\n基础评估：AI 成熟度 ${report.level}/L5（${report.levelDesc}）；建议切入方向「${report.focus}」；识别 ${report.spots} 处 AI 结合点；12 个月目标「${report.goal}」。`,
        },
      ], { maxTokens: 600, timeoutMs: 12000, json: true });
      const j = llm.parseJson(text);
      if (j.summary && typeof j.summary === 'string' && j.summary.length >= 60) {
        report.summary = j.summary.trim();
        if (Array.isArray(j.stage_notes)) {
          j.stage_notes.slice(0, 3).forEach((n, i) => {
            if (typeof n === 'string' && n.trim()) report.stages[i].note = n.trim();
          });
        }
        generator = 'llm';
      }
    } catch (e) {
      console.warn('[report] LLM 增强失败，回退模板：', e.message);
    }
  }
  return { report, generator };
}

module.exports = { QUESTIONS, baseReport, generate, getKB, DEFAULT_KB };
