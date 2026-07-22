// 站内 Agent（设计稿中的「小龙虾」职责）：智能助手应答 + 评论自动回复。
// 默认内置 FAQ 知识库；配置 LLM 后自动升级为知识库约束下的生成式回答，失败回退 FAQ。
const { db, getSetting, setSetting } = require('./db');
const llm = require('./llm');
const { logActivity, agentModes } = require('./config');

const SITE_KNOWLEDGE = `站点：Alan 个人品牌平台（HVAC × AI）。站主 Alan：暖通行业 AI 专家，20 多年制造业从业经验，帮助企业 AI 应用落地。
板块：
- 工具集（/tools）：HVAC Tool（暖通计算与选型，已上线）、AHRI 竞品分析、北美市场竞品分析、专利 AI 辅助助手，注册登录后在线使用。
- 企业 AI 服务（/services）：AI 现状诊断（免费，问卷+AI 报告+解读）、AI 落地咨询（按项目）、企业内训（按场次）。
- 企业 AI 诊断（/diagnosis）：5 题问卷约 10 分钟，无需准备材料，提交后生成诊断报告（AI 成熟度 L1-L5、AI 结合点、3 阶段路径）。
- AI 课程（/courses）：《制造业 AI 入门：从业务出发》12 讲 ¥299、《AI 竞品分析实战工作流》8 讲 ¥499，已上线；《专利工作中的 AI 助手》筹备中。
- 案例·培训（/cases）、AI 资讯（/blog）、关于与联系（/about，可留言）。
规则：只回答与本站/Alan 的服务相关的问题；不确定的信息不要编造，引导用户在「关于」页留言或做 AI 诊断。`;

// 快捷问题 → 设计稿标准答案（精确匹配，保证确定性）
const QUICK_ANSWERS = {
  '预约 AI 诊断': '好的。AI 诊断从一份约 10 分钟的问卷开始，完成后报告会发送到您的邮箱。您可以在「企业AI服务」页开始，或留下联系方式由 Alan 联系您。',
  '工具怎么用': '工具集里目前有 4 款工具：HVAC Tool、AHRI 竞品分析、北美市场竞品分析、专利 AI 助手。注册登录后即可在线使用，每款工具页内有使用文档。',
  '课程咨询': '目前已上线 2 门课程：《制造业 AI 入门》与《AI 竞品分析实战工作流》，登录后可购买学习。需要我帮您对比一下适合哪门吗？',
};

const FAQS = [
  {
    keys: ['ahri', '热泵', '品类', 'heat pump'],
    answer: '支持的。AHRI 竞品分析工具目前覆盖 AHRI 目录中的热泵与单元机品类，登录后在「品类」筛选中选择 Heat Pump 即可。详细说明见工具页文档。',
  },
  {
    keys: ['诊断', '问卷', '多久', '材料', '准备'],
    answer: '约 10 分钟，不需要提前准备材料——问卷围绕业务现状与目标，凭日常了解即可作答。完成后诊断报告会发送到您的邮箱。入口在「企业AI服务」页。',
  },
  {
    keys: ['课程', '价格', '多少钱', '购买', '学费'],
    answer: '目前已上线 2 门课程：《制造业 AI 入门：从业务出发》（12 讲，¥299）与《AI 竞品分析实战工作流》（8 讲，¥499），注册登录后可购买学习。',
  },
  {
    keys: ['工具', '怎么用', '使用', '登录'],
    answer: '工具集里目前有 4 款工具：HVAC Tool、AHRI 竞品分析、北美市场竞品分析、专利 AI 助手。注册登录后即可在线使用，每款工具页内有使用文档。',
  },
  {
    keys: ['内训', '培训', '合作', '咨询', '联系', '预约'],
    answer: '企业内训与落地咨询可以在「关于」页留言说明需求，或先完成企业 AI 诊断问卷——Alan 会主动与您联系安排一对一沟通。',
  },
];

const FALLBACK_REPLY = '已收到您的问题，我会转交 Alan 本人尽快回复。您也可以在「关于」页留下联系方式，或先做一份免费的企业 AI 诊断。';

function heartbeat() { setSetting('agent_last_active', new Date().toISOString()); }

function matchFaq(text) {
  const t = String(text || '').toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const f of FAQS) {
    const hits = f.keys.filter(k => t.includes(k.toLowerCase())).length;
    if (hits > bestHits) { best = f; bestHits = hits; }
  }
  return bestHits > 0 ? best.answer : null;
}

// 悬浮助手应答
async function assistantReply(message) {
  heartbeat();
  const msg = String(message || '').trim();
  if (QUICK_ANSWERS[msg]) return { reply: QUICK_ANSWERS[msg], via: 'faq' };

  if (llm.enabled()) {
    try {
      const reply = await llm.chat([
        { role: 'system', content: `你是「Alan 的智能客户助手」（AI Concierge）。${SITE_KNOWLEDGE}\n回答要求：中文、克制友好、不超过 120 字；答不了就建议留言，人工可接管。` },
        { role: 'user', content: msg },
      ], { maxTokens: 300, timeoutMs: 12000 });
      return { reply, via: 'llm' };
    } catch (e) {
      console.warn('[agent] 助手 LLM 失败，回退 FAQ：', e.message);
    }
  }
  const faq = matchFaq(msg);
  return { reply: faq || FALLBACK_REPLY, via: faq ? 'faq' : 'fallback' };
}

// 评论自动回复：常见问题即时回复并标注，其余标记 skipped 转人工。
// 无论结果如何都把评论置为终态（replied/skipped），供 Worker 去重与后台观测。
const setCommentStatus = (id, status) => db.prepare('UPDATE comments SET agent_status=? WHERE id=?').run(status, id);

async function commentAutoReply(postId, commentId, commentBody, actor = 'system:即时') {
  if (getSetting('agent_autoreply', '1') !== '1') return null; // 保持 pending，开启后由 Worker 补处理
  let replyText = null;
  let via = 'faq';

  if (llm.enabled()) {
    try {
      const text = await llm.chat([
        { role: 'system', content: `你是 Alan 网站的评论助理 Agent（小龙虾）。${SITE_KNOWLEDGE}\n任务：判断这条读者评论是否是可以直接回答的常见问题（工具/课程/诊断/服务相关）。只输出 JSON：{"can_answer":true/false,"reply":"若可回答给出不超过110字的中文回复，以 Alan 的口吻、克制专业"}。观点讨论、需要 Alan 本人判断的问题一律 can_answer=false。` },
        { role: 'user', content: `读者评论：${commentBody}` },
      ], { maxTokens: 300, timeoutMs: 10000, json: true });
      const j = llm.parseJson(text);
      if (j.can_answer && j.reply) { replyText = String(j.reply).trim(); via = 'llm'; }
    } catch (e) {
      console.warn('[agent] 评论 LLM 失败，回退 FAQ：', e.message);
      replyText = matchFaq(commentBody);
    }
  } else {
    replyText = matchFaq(commentBody);
  }

  if (!replyText) {
    setCommentStatus(commentId, 'skipped');
    logActivity(actor, 'comment_skip', `comment#${commentId}`, '非常见问题，转人工', true);
    return null;
  }
  heartbeat();
  const r = db.prepare(`INSERT INTO comments(post_id,user_id,author_name,body,parent_id,is_agent,agent_label,agent_status)
    VALUES (?,NULL,'Alan',?,?,1,'AI 自动回复 · via 小龙虾','replied')`).run(postId, replyText, commentId);
  setCommentStatus(commentId, 'replied');
  logActivity(actor, 'comment_reply', `comment#${commentId}`, `${via} · ${replyText.slice(0, 60)}`, true);
  return db.prepare('SELECT * FROM comments WHERE id=?').get(r.lastInsertRowid);
}

function agentStatus() {
  const modes = agentModes();
  return {
    autoreply: modes.autoreply,
    contentReview: modes.contentReview,
    scanIntervalMin: modes.scanIntervalMin,
    lastActive: getSetting('agent_last_active', null),
    mode: llm.enabled() ? `已连接 LLM（${llm.modelName()}）` : '内置 FAQ 模式',
    llm: llm.enabled(),
  };
}

module.exports = { assistantReply, commentAutoReply, agentStatus, matchFaq, SITE_KNOWLEDGE };
