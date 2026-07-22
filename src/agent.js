// 站内 Agent：悬浮助手应答 + 评论自动回复（Convation 版）。
// 默认内置 FAQ 知识库；配置 LLM 后自动升级为知识库约束下的生成式回答，失败回退 FAQ。
// 语言纪律：助手回复跟随访客语言（it/en，由调用方传入）；评论回复跟随文章语言。
const { db, getSetting, setSetting } = require('./db');
const llm = require('./llm');
const { logActivity, agentModes } = require('./config');

const SITE_KNOWLEDGE = `Sito: Convation (www.convation.it) — azienda italiana di climatizzazione: vendita, installazione e assistenza di climatizzatori e pompe di calore. Due pubblici: privati (preventivi, incentivi, assistenza) e installatori professionisti (area riservata).
Sezioni del sito: Prodotti (/prodotti), Detrazioni e incentivi (/detrazioni), Referenze (/referenze), Notizie (/notizie), FAQ (/faq), Consulenza e preventivi (/consulenza), Assistenza e riparazioni (/assistenza), Strumenti HVAC (/strumenti), Documentazione tecnica (/documentazione), Area installatori (/area-installatori), Contatti (/contatti), Chi siamo (/chi-siamo).
Punti fermi: sopralluogo e preventivo gratuiti; installazione a regola d'arte da installatori qualificati; assistenza anche post-vendita; supporto nelle pratiche per gli incentivi (le regole cambiano spesso: si verifica caso per caso).
Regole: rispondi SOLO su Convation, climatizzazione e pompe di calore. NON inventare prezzi, marchi a catalogo, tempi di consegna o percentuali fiscali. Se non sai una cosa, invita a chiedere un preventivo su /consulenza o a scrivere dai /contatti.`;

// 快捷问题 → 标准答案（精确匹配，保证确定性；与 assistant.ejs 的快捷按钮文案一一对应）
const QUICK_ANSWERS = {
  'Voglio un preventivo': 'Perfetto. Compila il modulo su /consulenza indicando metri quadri, stanze e impianto attuale: rispondiamo entro 24 ore lavorative con un sopralluogo gratuito. In alternativa lascia qui la tua domanda e ti indirizzo io.',
  'Che incentivi mi spettano?': 'Per climatizzatori e pompe di calore esistono più strade (es. Conto Termico e detrazioni fiscali), ma regole e aliquote cambiano spesso: le verifichiamo caso per caso prima del preventivo, così i conti sono reali. Trovi una panoramica su /detrazioni.',
  'Ho un guasto': 'Mi dispiace! Segnalalo su /assistenza indicando marca, modello e codice errore se visibile: ti richiamiamo entro 24 ore lavorative. Se l\'impianto perde acqua o senti odori anomali, spegnilo e attendi il tecnico.',
  'I want a quote': 'Great. Fill in the form at /en/consulenza with square metres, rooms and your current system: we reply within 24 working hours with a free survey. Or ask me here and I\'ll point you in the right direction.',
  'Which incentives apply to me?': 'For air conditioners and heat pumps there are several routes (e.g. Conto Termico and tax deductions), but rules and rates change often: we verify them case by case before quoting, so the numbers are real. See /en/detrazioni for an overview.',
  'I have a fault': 'Sorry to hear that! Report it at /en/assistenza with brand, model and any error code: we call back within 24 working hours. If the unit leaks water or smells odd, switch it off and wait for the technician.',
};

// 关键词 FAQ（意英双语关键词，命中最多者胜；答案按语言取）
const FAQS = [
  {
    keys: ['preventivo', 'costo', 'costa', 'prezzo', 'quote', 'price', 'cost'],
    it: 'I prezzi dipendono da casa, impianto e installazione, quindi non diamo cifre a caso: il preventivo è gratuito e senza impegno. Compila il modulo su /consulenza e rispondiamo entro 24 ore lavorative.',
    en: 'Prices depend on your home, the system and the installation, so we don\'t quote blind figures: the quote is free and non-binding. Fill in the form at /en/consulenza and we reply within 24 working hours.',
  },
  {
    keys: ['incentiv', 'detrazion', 'conto termico', 'bonus', 'agevolazion', 'deduction', 'tax'],
    it: 'Gli incentivi esistono ma cambiano spesso: verifichiamo aliquote e requisiti caso per caso prima del preventivo, e ti supportiamo nelle pratiche. Panoramica su /detrazioni.',
    en: 'Incentives exist but change often: we verify rates and requirements case by case before quoting, and we support you with the paperwork. Overview at /en/detrazioni.',
  },
  {
    keys: ['guasto', 'errore', 'riparazion', 'rotto', 'non funziona', 'perde', 'fault', 'error', 'repair', 'broken', 'not working', 'leak'],
    it: 'Segnala il guasto su /assistenza indicando marca, modello, codice errore e da quando succede: ti richiamiamo entro 24 ore lavorative. Interveniamo anche su impianti non installati da noi.',
    en: 'Report the fault at /en/assistenza with brand, model, error code and when it started: we call back within 24 working hours. We also service systems we did not install.',
  },
  {
    keys: ['installator', 'rivenditor', 'partner', 'listino', 'installer', 'reseller', 'trade'],
    it: 'Se sei un installatore, registrati nell\'Area installatori (/area-installatori): accesso a documentazione, listini e condizioni dedicate. Ti chiederemo P.IVA e certificazione F-Gas per l\'abilitazione.',
    en: 'If you are an installer, sign up in the Installer area (/en/area-installatori): access to documentation, price lists and trade terms. We will ask for your VAT number and F-Gas certification.',
  },
  {
    keys: ['tempi', 'quanto tempo', 'consegna', 'quando', 'sopralluogo', 'lead time', 'how long', 'survey'],
    it: 'Si parte sempre dal sopralluogo gratuito; tempi di consegna e installazione dipendono dal prodotto e dalla stagione, e li trovi nero su bianco nel preventivo. Richiedilo su /consulenza.',
    en: 'Everything starts with a free survey; delivery and installation times depend on the product and the season, and are stated clearly in your quote. Request it at /en/consulenza.',
  },
];

const FALLBACK = {
  it: 'Ho ricevuto la tua domanda: la passo a una persona del team Convation, che ti risponderà appena possibile. Se preferisci, chiedi un preventivo gratuito su /consulenza o scrivici dai /contatti.',
  en: 'I\'ve got your question and will pass it to a person on the Convation team, who will reply as soon as possible. If you prefer, ask for a free quote at /en/consulenza or write to us via /en/contatti.',
};

function heartbeat() { setSetting('agent_last_active', new Date().toISOString()); }

function matchFaq(text, lang = 'it') {
  const t = String(text || '').toLowerCase();
  let best = null;
  let bestHits = 0;
  for (const f of FAQS) {
    const hits = f.keys.filter(k => t.includes(k.toLowerCase())).length;
    if (hits > bestHits) { best = f; bestHits = hits; }
  }
  return bestHits > 0 ? (lang === 'en' ? best.en : best.it) : null;
}

// 悬浮助手应答（lang 由 API 层从访问路径推断：/en → en，默认 it）
async function assistantReply(message, lang = 'it') {
  heartbeat();
  const msg = String(message || '').trim();
  if (QUICK_ANSWERS[msg]) return { reply: QUICK_ANSWERS[msg], via: 'faq' };

  const replyLang = lang === 'en' ? 'inglese (English)' : 'italiano';
  if (llm.enabled()) {
    try {
      const reply = await llm.chat([
        { role: 'system', content: `Sei l'assistente Convation (AI, con possibilità di passaggio a una persona).\n${SITE_KNOWLEDGE}\nRequisiti di risposta: rispondi in ${replyLang}, tono cortese e concreto, massimo 90 parole; se non puoi rispondere, suggerisci /consulenza o /contatti.` },
        { role: 'user', content: msg },
      ], { maxTokens: 300, timeoutMs: 12000 });
      return { reply, via: 'llm' };
    } catch (e) {
      console.warn('[agent] 助手 LLM 失败，回退 FAQ：', e.message);
    }
  }
  const faq = matchFaq(msg, lang);
  return { reply: faq || FALLBACK[lang === 'en' ? 'en' : 'it'], via: faq ? 'faq' : 'fallback' };
}

// 评论自动回复：常见问题即时回复并标注，其余标记 skipped 转人工；回复语言跟随文章语言。
// 无论结果如何都把评论置为终态（replied/skipped），供 Worker 去重与后台观测。
const setCommentStatus = (id, status) => db.prepare('UPDATE comments SET agent_status=? WHERE id=?').run(status, id);

async function commentAutoReply(postId, commentId, commentBody, actor = 'system:即时') {
  if (getSetting('agent_autoreply', '1') !== '1') return null; // 保持 pending，开启后由 Worker 补处理
  const post = db.prepare('SELECT lang FROM posts WHERE id=?').get(postId);
  const lang = post && post.lang === 'en' ? 'en' : 'it';
  const replyLang = lang === 'en' ? 'inglese (English)' : 'italiano';
  let replyText = null;
  let via = 'faq';

  if (llm.enabled()) {
    try {
      const text = await llm.chat([
        { role: 'system', content: `Sei l'assistente commenti del sito Convation.\n${SITE_KNOWLEDGE}\nCompito: valuta se questo commento di un lettore è una domanda frequente a cui puoi rispondere direttamente (preventivi/incentivi/guasti/installatori/tempi). Output SOLO JSON: {"can_answer":true/false,"reply":"se rispondibile, massimo 80 parole in ${replyLang}, tono Convation cortese e concreto"}. Opinioni, casi specifici o valutazioni tecniche puntuali: can_answer=false.` },
        { role: 'user', content: `Commento del lettore: ${commentBody}` },
      ], { maxTokens: 300, timeoutMs: 10000, json: true });
      const j = llm.parseJson(text);
      if (j.can_answer && j.reply) { replyText = String(j.reply).trim(); via = 'llm'; }
    } catch (e) {
      console.warn('[agent] 评论 LLM 失败，回退 FAQ：', e.message);
      replyText = matchFaq(commentBody, lang);
    }
  } else {
    replyText = matchFaq(commentBody, lang);
  }

  if (!replyText) {
    setCommentStatus(commentId, 'skipped');
    logActivity(actor, 'comment_skip', `comment#${commentId}`, '非常见问题，转人工', true);
    return null;
  }
  heartbeat();
  const r = db.prepare(`INSERT INTO comments(post_id,user_id,author_name,body,parent_id,is_agent,agent_label,agent_status)
    VALUES (?,NULL,'Convation',?,?,1,'AI · Worker','replied')`).run(postId, replyText, commentId);
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
