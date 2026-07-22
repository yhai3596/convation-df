// 前台双语：意语默认（无前缀）+ 英语（/en 前缀）。
// 同一个 pages router 挂载在 '/' 与 '/en' 两处，由 req.baseUrl 判定语言；
// 文案经 content.ctFor(locale) 取值，回退链 key.{locale} → key.it → key。
const siteContent = require('./content');
const { supportChannels } = require('./support');

const SUPPORTED = ['it', 'en'];
const DEFAULT_LOCALE = 'it';

function middleware(req, res, next) {
  const locale = req.baseUrl === '/en' ? 'en' : DEFAULT_LOCALE;
  req.locale = locale;
  res.locals.locale = locale;
  res.locals.lang = locale; // head.ejs <html lang>
  // lp('/prodotti') → 意语 '/prodotti'，英语 '/en/prodotti'（导航/链接统一走它）
  res.locals.lp = p => (locale === DEFAULT_LOCALE ? p : (p === '/' ? '/en' : '/en' + p));
  // 当前页在另一语言下的地址（语言切换按钮 + hreflang 用）
  const bare = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
  res.locals.altHref = locale === 'en' ? bare : (bare === '/' ? '/en' : '/en' + bare);
  // SEO：站点基址 + 当前页规范路径（不含查询串；head.ejs canonical/hreflang/og 用）
  res.locals.siteBase = process.env.SITE_BASE || 'https://www.convation.it';
  res.locals.canonicalPath = locale === 'en' ? (bare === '/' ? '/en' : '/en' + bare) : bare;
  // 本地化文案助手：覆盖 app.locals 的全局版（res.locals 优先于 app.locals）
  const c = siteContent.ctFor(locale);
  res.locals.ct = c.ct;
  res.locals.ctBr = c.ctBr;
  res.locals.ctImg = c.ctImg;
  res.locals.ctRaw = c.raw;
  // 移动端速联条（页脚渲染）：读一次 settings，未配置通道自动隐藏
  res.locals.speedDial = supportChannels(locale);
  next();
}

module.exports = { SUPPORTED, DEFAULT_LOCALE, middleware };
