// 文本小工具：SEO slug 与罗马时区日期（agent-api 与后台内容管理共用）
const romeDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const slugify = s => String(s).normalize('NFKD').replace(/\p{M}+/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';
module.exports = { romeDate, slugify };
