// 把 fontsource 字体（css + woff2）复制到 public/vendor 下自托管，
// 避免线上引用 Google Fonts（国内访客不可达）。postinstall 自动执行。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FAMILIES = [
  { pkg: '@fontsource/archivo', out: 'archivo', css: ['400.css', '600.css', '700.css'] },
  { pkg: '@fontsource/inter', out: 'inter', css: ['400.css', '600.css', '700.css'] },
];

let ok = true;
for (const fam of FAMILIES) {
  const src = path.join(ROOT, 'node_modules', fam.pkg);
  const dest = path.join(ROOT, 'public', 'vendor', fam.out);
  if (!fs.existsSync(src)) { console.warn(`[fonts] missing package ${fam.pkg} — run npm install`); ok = false; continue; }
  fs.mkdirSync(path.join(dest, 'files'), { recursive: true });
  // 只复制 css 实际引用的 woff2 分片（fontsource 的 CJK 整包文件近百 MB，不能进仓库）
  const refs = new Set();
  for (const cssFile of fam.css) {
    const from = path.join(src, cssFile);
    if (!fs.existsSync(from)) { console.warn(`[fonts] ${fam.pkg}/${cssFile} not found`); ok = false; continue; }
    fs.copyFileSync(from, path.join(dest, cssFile));
    for (const m of fs.readFileSync(from, 'utf8').matchAll(/files\/([^)'"]+\.woff2)/g)) refs.add(m[1]);
  }
  let bytes = 0;
  for (const f of refs) {
    const fp = path.join(src, 'files', f);
    if (fs.existsSync(fp)) { fs.copyFileSync(fp, path.join(dest, 'files', f)); bytes += fs.statSync(fp).size; }
  }
  console.log(`[fonts] ${fam.out}: css=${fam.css.length}, woff2=${refs.size}, ${(bytes / 1048576).toFixed(1)}MB`);
}
process.exit(ok ? 0 : 0); // 字体缺失不阻断安装，站点会退回系统衬线
