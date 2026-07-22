// 前台页面渲染（意/英双语：同一 router 挂载 '/' 与 '/en'，req.locale 由 i18n 中间件设定）
// 13 页先以 wip 占位打通全站骨架，逐页替换为正式视图（进度见 tasks.md Phase 2）。
const express = require('express');
const { marked } = require('marked');

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

router.get('/consulenza', (req, res) => wip(req, res, {
  title: t(req, 'Consulenza e assistente AI · Convation', 'Consulting and AI assistant · Convation'),
  name: t(req, 'Consulenza', 'Consulting'),
}));

router.get('/notizie', (req, res) => wip(req, res, {
  title: t(req, 'Notizie dal settore · Convation', 'Industry news · Convation'),
  active: 'notizie', name: t(req, 'Notizie', 'News'),
}));

router.get('/notizie/:slug', (req, res) => wip(req, res, {
  title: t(req, 'Notizie · Convation', 'News · Convation'),
  active: 'notizie', name: t(req, 'Notizie', 'News'),
}));

router.get('/faq', (req, res) => wip(req, res, {
  title: t(req, 'Domande frequenti · Convation', 'FAQ · Convation'),
  name: t(req, 'Domande frequenti', 'Frequently asked questions'),
}));

router.get('/strumenti', (req, res) => wip(req, res, {
  title: t(req, 'Strumenti HVAC · Convation', 'HVAC tools · Convation'),
  name: t(req, 'Strumenti HVAC', 'HVAC tools'),
}));

router.get('/assistenza', (req, res) => wip(req, res, {
  title: t(req, 'Assistenza e garanzia · Convation', 'Support and warranty · Convation'),
  active: 'assistenza', name: t(req, 'Assistenza', 'Support'),
}));

router.get('/detrazioni-e-incentivi', (req, res) => wip(req, res, {
  title: t(req, 'Detrazioni e incentivi per climatizzazione · Convation', 'Tax incentives for HVAC · Convation'),
  active: 'detrazioni', name: t(req, 'Detrazioni e incentivi', 'Tax incentives'),
}));

router.get('/contatti', (req, res) => wip(req, res, {
  title: t(req, 'Contatti · Convation', 'Contact · Convation'),
  active: 'contatti', name: t(req, 'Contatti', 'Contact'),
}));

router.get('/area-installatori', (req, res) => wip(req, res, {
  title: t(req, 'Area installatori · Convation', 'Installer area · Convation'),
  active: 'area', name: t(req, 'Area installatori', 'Installer area'),
}));

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
