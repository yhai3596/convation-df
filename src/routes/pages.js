// 前台页面渲染（意/英双语：同一 router 挂载 '/' 与 '/en'，req.locale 由 i18n 中间件设定）
// 13 页先以 wip 占位打通全站骨架，逐页替换为正式视图（进度见 tasks.md Phase 2）。
const express = require('express');
const { marked } = require('marked');
const { db } = require('../db');
const { supportChannels: channelsFor } = require('../support');
const supportChannels = req => channelsFor(req.locale);

const router = express.Router();
const t = (req, it, en) => (req.locale === 'en' ? en : it);

function wip(req, res, { title, active = '', name }) {
  res.render('wip', { title, active, pageName: name });
}

router.get('/', (req, res) => {
  res.render('home', {
    title: t(req,
      'Convation — Climatizzatori e pompe di calore: vendita, installazione, assistenza',
      'Convation — Air conditioning and heat pumps: sales, installation, service'),
    active: 'home',
    metaDesc: t(req,
      'Convation vende, installa e assiste climatizzatori e pompe di calore in Italia: tecnici certificati F-Gas, marchi ufficiali, preventivo gratuito in 24 ore.',
      'Convation sells, installs and services air conditioners and heat pumps in Italy: F-Gas certified technicians, official brands, free quote within 24 hours.'),
    // 地址/电话/P.IVA 等法务数据到位后补进（T5.3 素材单），届时才够格 LocalBusiness 富结果
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'HVACBusiness',
      name: 'Convation', url: 'https://www.convation.it/',
      description: t(req,
        'Vendita, installazione e assistenza di climatizzatori e pompe di calore in Italia.',
        'Sales, installation and service of air conditioners and heat pumps in Italy.'),
      areaServed: { '@type': 'Country', name: 'Italy' },
      knowsAbout: ['climatizzatori', 'pompe di calore', 'installazione HVAC', 'assistenza e manutenzione', 'Conto Termico e detrazioni'],
    },
  });
});

router.get('/chi-siamo', (req, res) => {
  res.render('chi-siamo', {
    title: t(req, 'Chi siamo · Convation', 'About us · Convation'),
    active: '',
    metaDesc: t(req,
      'Convation è un\'azienda registrata in Italia specializzata in climatizzazione: vendiamo, installiamo e assistiamo climatizzatori e pompe di calore.',
      'Convation is a company registered in Italy specialised in HVAC: we sell, install and service air conditioners and heat pumps.'),
  });
});

router.get('/prodotti', (req, res) => {
  res.render('prodotti', {
    title: t(req, 'Prodotti — Climatizzatori e pompe di calore · Convation', 'Products — Air conditioners and heat pumps · Convation'),
    active: 'prodotti',
    metaDesc: t(req,
      'Climatizzatori mono e multi split e pompe di calore aria-acqua dei migliori marchi: selezionati, installati e assistiti da Convation.',
      'Mono and multi split air conditioners and air-to-water heat pumps from leading brands: selected, installed and serviced by Convation.'),
    // 具体型号/价格未定（占位素材阶段），Product 只挂品类不挂 offer，不编造
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, item: { '@type': 'Product', name: t(req, 'Climatizzatori mono e multi split', 'Mono and multi split air conditioners'), category: 'HVAC' } },
        { '@type': 'ListItem', position: 2, item: { '@type': 'Product', name: t(req, 'Pompe di calore aria-acqua', 'Air-to-water heat pumps'), category: 'HVAC' } },
      ],
    },
  });
});

router.get('/documentazione', (req, res) => {
  res.render('documentazione', {
    title: t(req, 'Documentazione tecnica · Convation', 'Technical documents · Convation'),
    active: '',
    metaDesc: t(req,
      'Schede tecniche, cataloghi e manuali di climatizzatori e pompe di calore. Listini riservati agli installatori registrati.',
      'Data sheets, catalogues and manuals for air conditioners and heat pumps. Price lists reserved for registered installers.'),
  });
});

router.get('/referenze', (req, res) => {
  res.render('referenze', {
    title: t(req, 'Referenze e installazioni · Convation', 'Projects and installations · Convation'),
    active: 'referenze',
    metaDesc: t(req,
      'Le nostre installazioni di climatizzatori e pompe di calore: contesto, soluzione scelta e schema d\'impianto per ogni intervento.',
      'Our air conditioner and heat pump installations: context, chosen solution and system layout for each job.'),
  });
});

router.get('/consulenza', (req, res) => {
  res.render('consulenza', {
    title: t(req, 'Consulenza e assistente AI · Convation', 'Consulting and AI assistant · Convation'),
    active: '',
    channels: supportChannels(req),
    metaDesc: t(req,
      'Assistente AI 24/7 per domande su climatizzatori, pompe di calore, incentivi e guasti — con canali umani e preventivo su richiesta.',
      '24/7 AI assistant for questions on air conditioners, heat pumps, incentives and faults — with human channels and quotes on request.'),
  });
});

router.get('/notizie', (req, res) => {
  const cat = (req.query.cat || '').slice(0, 40);
  const cats = db.prepare("SELECT DISTINCT category FROM posts WHERE status='published' AND lang=?").all(req.locale).map(r => r.category);
  const posts = cat
    ? db.prepare("SELECT * FROM posts WHERE status='published' AND lang=? AND category=? ORDER BY published_at DESC").all(req.locale, cat)
    : db.prepare("SELECT * FROM posts WHERE status='published' AND lang=? ORDER BY published_at DESC").all(req.locale);
  res.render('notizie', {
    title: t(req, 'Notizie e guide HVAC · Convation', 'HVAC news and guides · Convation'),
    active: 'notizie', posts, cats, cat,
    metaDesc: t(req,
      'Notizie e guide su climatizzatori, pompe di calore, incentivi e manutenzione, curate da Convation.',
      'News and guides on air conditioners, heat pumps, incentives and maintenance, curated by Convation.'),
  });
});

router.get('/notizie/:slug', (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").get(req.params.slug);
  if (!post) return res.status(404).render('404', { title: t(req, 'Pagina non trovata · Convation', 'Page not found · Convation'), active: '' });
  db.prepare('UPDATE posts SET views = views + 1 WHERE id=?').run(post.id);
  post.views += 1;
  // 文章只属于一个语言版：canonical 指向所属语言路径（跨前缀访问不产生镜像收录），无翻译对应则不挂 hreflang 对
  res.locals.canonicalPath = (post.lang === 'en' ? '/en' : '') + `/notizie/${post.slug}`;
  res.locals.noHreflang = true;
  const all = db.prepare('SELECT * FROM comments WHERE post_id=? ORDER BY created_at, id').all(post.id);
  const comments = all.filter(c => !c.parent_id).map(c => ({ ...c, replies: all.filter(r => r.parent_id === c.id) }));
  res.render('notizia', {
    title: `${post.title} · Convation`,
    active: 'notizie', post,
    contentHtml: marked.parse(post.content_md || ''),
    comments,
    commentCount: comments.length,
    metaDesc: (post.excerpt || '').slice(0, 160),
    ogType: 'article',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: post.title,
      description: (post.excerpt || '').slice(0, 160),
      datePublished: post.published_at || undefined,
      dateModified: (post.updated_at || '').slice(0, 10) || post.published_at || undefined,
      inLanguage: post.lang === 'en' ? 'en' : 'it',
      author: { '@type': 'Organization', name: 'Convation' },
      publisher: { '@type': 'Organization', name: 'Convation' },
    },
  });
});

router.get('/faq', (req, res) => {
  res.render('faq', {
    title: t(req, 'Domande frequenti su climatizzatori e pompe di calore · Convation', 'Air conditioner and heat pump FAQ · Convation'),
    active: '',
    metaDesc: t(req,
      'Costi, tempi, permessi, incentivi, manutenzione e garanzia: risposte dirette alle domande più frequenti su climatizzatori e pompe di calore.',
      'Costs, lead times, permissions, incentives, maintenance and warranty: straight answers to the most common HVAC questions.'),
  });
});

router.get('/strumenti', (req, res) => {
  res.render('strumenti', {
    title: t(req, 'Strumenti HVAC · Convation', 'HVAC tools · Convation'),
    active: '',
    metaDesc: t(req,
      'Strumenti di calcolo per climatizzazione e pompe di calore: dimensionamento, conversioni e verifiche rapide per installatori.',
      'HVAC calculation tools: sizing, conversions and quick checks for installers.'),
  });
});

router.get('/assistenza', (req, res) => {
  res.render('assistenza', {
    title: t(req, 'Assistenza e garanzia · Convation', 'Support and warranty · Convation'),
    active: 'assistenza',
    channels: supportChannels(req),
    metaDesc: t(req,
      'Garanzia, manutenzione programmata e riparazioni per climatizzatori e pompe di calore: segnala un guasto e ti richiamiamo entro 24 ore lavorative.',
      'Warranty, scheduled maintenance and repairs for air conditioners and heat pumps: report a fault and we call back within 24 working hours.'),
  });
});

router.get('/detrazioni-e-incentivi', (req, res) => {
  res.render('detrazioni', {
    title: t(req, 'Detrazioni e incentivi per pompe di calore e climatizzatori · Convation', 'Incentives for heat pumps and air conditioners · Convation'),
    active: 'detrazioni',
    metaDesc: t(req,
      'Conto Termico e detrazioni fiscali per pompe di calore e climatizzatori: verifichiamo i requisiti e prepariamo le pratiche al posto tuo.',
      'Conto Termico and tax deductions for heat pumps and air conditioners: we check your eligibility and handle the paperwork for you.'),
  });
});

router.get('/contatti', (req, res) => {
  res.render('contatti', {
    title: t(req, 'Contatti · Convation', 'Contact · Convation'),
    active: 'contatti',
    channels: supportChannels(req),
    metaDesc: t(req,
      'Contatta Convation per preventivi e assistenza su climatizzatori e pompe di calore: rispondiamo entro 24 ore lavorative.',
      'Contact Convation for quotes and support on air conditioners and heat pumps: we reply within 24 working hours.'),
  });
});

router.get('/area-installatori', (req, res) => {
  res.render('area-installatori', {
    title: t(req, 'Area installatori · Convation', 'Installer area · Convation'),
    active: 'area',
    metaDesc: t(req,
      'Registrati come installatore: prezzi riservati, documentazione tecnica, strumenti professionali e corsia preferenziale in assistenza.',
      'Register as an installer: trade prices, technical documentation, professional tools and a priority support lane.'),
  });
});

router.get('/privacy', (req, res) => wip(req, res, {
  title: 'Privacy policy · Convation', name: 'Privacy policy',
}));

router.get('/cookie', (req, res) => wip(req, res, {
  title: 'Cookie policy · Convation', name: 'Cookie policy',
}));

router.get('/login', (req, res) => {
  if (res.locals.user) return res.redirect(req.query.next || '/');
  res.render('login', { title: t(req, 'Accedi · Convation', 'Sign in · Convation'), active: '', next: req.query.next || '/' });
});

// Agent API 文档（管理员，渲染 docs/AGENT_API.md）
router.get('/docs/agent-api', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login?next=/docs/agent-api');
  const fs = require('fs');
  const path = require('path');
  let html = '<p>文档缺失。</p>';
  try { html = marked.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'AGENT_API.md'), 'utf8')); } catch (e) { /* noop */ }
  res.render('doc', { title: 'Agent API 文档 · Convation', active: '', contentHtml: html });
});

module.exports = router;
