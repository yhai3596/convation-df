// 站内自动化 Worker（自动化管理核心）：
// 在服务进程内定时巡检，自动处理评论积压——包括发表瞬间处理失败（LLM 超时）、
// 自动回复开关关闭期间积压、外部 Agent 未消费的评论。全部动作写入 agent_activity。
// 无需任何外部进程/CLI 常驻，服务在自动化就在。
const { db, setSetting } = require('./db');
const { agentModes, logActivity } = require('./config');
const agent = require('./agent');

const TICK_MS = 60 * 1000;      // 基础节拍 1 分钟，实际间隔按后台配置
const BATCH = 5;                // 每轮最多处理条数（限流，防 LLM 突发消耗）
const MIN_AGE_SEC = 90;         // 只处理发表超过 90 秒的评论，避免与即时回复路径竞态

let lastSweep = 0;
let running = false;

const pickPending = db.prepare(`
  SELECT id, post_id, body FROM comments
  WHERE parent_id IS NULL AND is_agent = 0
    AND (agent_status IS NULL OR agent_status = 'pending')
    AND created_at <= datetime('now', '-${MIN_AGE_SEC} seconds')
  ORDER BY id LIMIT ${BATCH}`);

async function sweep() {
  const modes = agentModes();
  setSetting('worker_last_tick', new Date().toISOString());
  if (!modes.autoreply) return; // 关闭时不动状态，开启后积压自动补处理

  const pending = pickPending.all();
  if (pending.length === 0) return;

  let replied = 0;
  let skipped = 0;
  for (const c of pending) {
    try {
      const r = await agent.commentAutoReply(c.post_id, c.id, c.body, 'system:worker');
      if (r) replied += 1; else skipped += 1;
    } catch (e) {
      logActivity('system:worker', 'comment_error', `comment#${c.id}`, e.message, false);
    }
  }
  console.log(`[worker] 评论巡检：处理 ${pending.length} 条（回复 ${replied} / 转人工 ${skipped}）`);
}

function start() {
  const timer = setInterval(async () => {
    if (running) return;
    const modes = agentModes();
    if (Date.now() - lastSweep < modes.scanIntervalMin * 60 * 1000) return;
    lastSweep = Date.now();
    running = true;
    try { await sweep(); } catch (e) { console.warn('[worker] 巡检异常：', e.message); }
    running = false;
  }, TICK_MS);
  timer.unref();
  console.log('[worker] 站内自动化已启动（评论巡检，间隔按后台配置）');
}

// 待处理队列概览（后台 Agent 中心展示）
function queueStats() {
  const pending = db.prepare(`SELECT COUNT(*) c FROM comments WHERE parent_id IS NULL AND is_agent=0 AND (agent_status IS NULL OR agent_status='pending')`).get().c;
  const skipped = db.prepare(`SELECT COUNT(*) c FROM comments WHERE agent_status='skipped'`).get().c;
  const replied = db.prepare(`SELECT COUNT(*) c FROM comments WHERE agent_status='replied' AND parent_id IS NULL`).get().c;
  return { pending, skipped, replied };
}

module.exports = { start, sweep, queueStats };
