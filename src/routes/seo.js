// SEO/GEO 出口：sitemap.xml（双语 hreflang 对 + 已发布文章）/ robots.txt / llms.txt（AI 爬虫导引）
const express = require('express');
const { db } = require('../db');

const router = express.Router();
const BASE = () => process.env.SITE_BASE || 'https://www.convation.it';

// 收录的静态页（意语路径；privacy/cookie 仍是占位页，先不入图）
const PAGES = ['/', '/chi-siamo', '/prodotti', '/documentazione', '/referenze', '/consulenza',
  '/notizie', '/faq', '/strumenti', '/assistenza', '/detrazioni-e-incentivi', '/contatti', '/area-installatori'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

router.get('/sitemap.xml', (req, res) => {
  const base = BASE();
  const en = p => (p === '/' ? '/en' : '/en' + p);
  const urls = [];
  for (const p of PAGES) {
    const alts =
      `<xhtml:link rel="alternate" hreflang="it" href="${base + p}"/>` +
      `<xhtml:link rel="alternate" hreflang="en" href="${base + en(p)}"/>` +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${base + p}"/>`;
    urls.push(`<url><loc>${base + p}</loc>${alts}</url>`);
    urls.push(`<url><loc>${base + en(p)}</loc>${alts}</url>`);
  }
  // 文章只列在所属语言版路径下（无跨语言镜像）
  const posts = db.prepare("SELECT slug, lang, COALESCE(updated_at, published_at) u FROM posts WHERE status='published'").all();
  for (const p of posts) {
    const loc = (p.lang === 'en' ? '/en' : '') + '/notizie/' + p.slug;
    const lastmod = p.u ? `<lastmod>${String(p.u).slice(0, 10)}</lastmod>` : '';
    urls.push(`<url><loc>${esc(base + loc)}</loc>${lastmod}</url>`);
  }
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /login',
    'Disallow: /api/',
    '',
    `Sitemap: ${BASE()}/sitemap.xml`,
    '',
  ].join('\n'));
});

router.get('/llms.txt', (req, res) => {
  const b = BASE();
  res.type('text/plain; charset=utf-8').send(`# Convation

> Convation è un'azienda registrata in Italia che vende, installa e assiste climatizzatori e pompe di calore, per privati e installatori professionisti. Sito bilingue: italiano (default) e inglese (prefisso /en). Tecnici certificati F-Gas, preventivo gratuito entro 24 ore lavorative.

## Pagine principali

- [Prodotti](${b}/prodotti): climatizzatori mono e multi split, pompe di calore aria-acqua
- [Detrazioni e incentivi](${b}/detrazioni-e-incentivi): Conto Termico e detrazioni fiscali, pratiche a cura di Convation
- [FAQ](${b}/faq): costi, tempi, permessi, incentivi, manutenzione e garanzia
- [Notizie](${b}/notizie): guide e aggiornamenti su climatizzazione e pompe di calore
- [Consulenza](${b}/consulenza): assistente AI 24/7 per domande pre e post vendita
- [Assistenza](${b}/assistenza): garanzia, manutenzione programmata, segnalazione guasti
- [Referenze](${b}/referenze): installazioni realizzate
- [Contatti](${b}/contatti): preventivi e supporto, risposta entro 24 ore lavorative
- [Area installatori](${b}/area-installatori): registrazione, prezzi riservati, documentazione tecnica

## English

- [English version](${b}/en): full site in English under the /en prefix

## Note per gli agenti AI

- Prezzi e aliquote non sono pubblicati sul sito: per un preventivo indirizzare alla pagina Contatti (${b}/contatti).
- Le regole su detrazioni e incentivi cambiano di anno in anno: non citare percentuali specifiche, rimandare alla pagina dedicata.
`);
});

module.exports = router;
