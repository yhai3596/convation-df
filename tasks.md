# 项目任务文件

## 项目信息
- 名称: convation-website（Convation 官网，www.convation.it）
- 类型: complex-task
- 开始时间: 2026-07-22 晚
- 状态: in_progress
- 设计真值: `E:\AICoding\Euro\web\DESIGN.md`（已确认 2026-07-22，门禁一通过）
- 对照组: `E:\AICoding\Euro\convation\`（另一方法的 A/B 对照，**只读，永不修改**）

## 用户原始需求
意大利注册暖通公司 Convation 官网：意/英双语前台 13 页 + 英/中后台。品牌故事、产品、技术文档、案例、咨询（AI 助理）、Notizie 行业资讯（小龙虾/hermes 经鉴权 Agent API 自动供稿+评论自动回复）、FAQ 独立页、暖通工具（先接 hvac.geopro.cc）、售后、Detrazioni 税惠页、安装工注册（资质审核预留）。全站悬浮 AI 助手。客服通道（邮箱/电话/WhatsApp）后台可配。SEO/GEO 载体。参考竞品 idemaclima.it 的意式专业感，颜色蓝主橙点缀封顶 4 色。

## 任务拆解

### Phase 1: 底座改造
- [x] T1.1 fork 骨架：alan-platform → convation-df，改名+端口 8203+字体依赖 Archivo/Inter（commit 8397cdc）
- [x] T1.2 npm install + 本地 8203 冒烟（HTTP 200 + 字体切片 200，commit 前验证）
- [x] T1.3 ds.css 重写 token 层 = DESIGN.md §3–§7 真值（commit ee1185a）
- [x] T1.4 清除 alan 主题机制：theme.js 删除、site.css/assistant.ejs 衬线清零、head.ejs 换字体链+favicon（commit ee1185a）
- [x] T1.5 i18n 机制（commit 98eeeb3）：/ 与 /en 双挂载；ctFor(locale) 回退链；lp()/altHref 助手；hreflang 标签留待 T4.2

### Phase 2: 前台 13 页（每页一个可验证单元，逐页 commit）
- [x] T2.1 partials：nav（6 项+Area installatori 按钮，sticky 72→60px）、footer（墨青四栏+法务占位）、head/tail —— commit cdb2780
- [x] T2.2 Home 10 区（DESIGN.md §6 顺序）—— 双语注册表 src/registry.js（~50 键，后台可改）+ ctFor 接线；fade-up 420ms/数字滚动 900ms/data-open-assistant 落 site.js；IT+EN 双端 200、关键文案 curl 实证、浏览器 a11y 树走查零控制台报错
- [x] T2.3 Prodotti 分类页（两大类图文反排+要点清单+配件预留位+品牌占位六格+页尾深色 CTA；产品详情模板待真实目录数据到货再建，入 T5.3 催收）
- [x] T2.4 Chi siamo（故事+数字浅底/三承诺/资质在途占位）/ Referenze（案例行=照片+场景+方案，复用 home 案例键+新增方案键）/ Documentazione（三类文档占位卡+价格表登录门→Area installatori）
- [x] T2.5 Notizie：posts 表加 lang 列（幂等迁移）；列表页（分类 pill+订阅框+空态文案）/详情页（markdown 正文+评论树+agent 徽标+登录门评论框）；验证=插测试文→列表/详情/分类/EN 空态（lang 过滤反向证据）→删清
- [x] T2.6 FAQ（三组九问手风琴+JSON-LD FAQPage，ctRaw 未转义输出，json.loads 校验通过）/ Consulenza（AI 通道 CTA+可问清单、人工通道读 settings 未配置显在途提示、询价表单落 messages 表实证入库）；整页内嵌对话待 T3.1 助手改皮时一并处理
- [x] T2.7 Strumenti（HVAC Toolbox 外链卡+两张 In arrivo 虚线占位卡+安装工导流条；工具改 DB 管理留给 T3.5 定夺）/ Assistenza（三支柱+报修三步+人工通道 settings 读取+报修表单→messages）
- [x] T2.8 Detrazioni（两激励卡+规则常变声明，不写具体税率+三步代办）/ Contatti（表单→messages+通道+法务占位卡）/ Area installatori（登录态面板/注册+登录表单+P.IVA/F-Gas 资质审核预留说明；注册→会话→面板全链路实证后删测试号）
- [x] T2.9 移动端速联条：src/support.js 公共通道模块（pages.js/i18n 共用）；页脚渲染 Chiama/WhatsApp（配置驱动）+Preventivo/Aiuto AI（恒在）；助手气泡/toast 抬升避让；顺手修掉 server 级 404/500 兜底（补 i18n locals+去 alan 中文标题）。验证=settings 置入→出现→撤销→隐藏 双向实证 + 404 页正常渲染

### Phase 3: 功能接线
- [x] T3.1 AI 助手改皮：气泡+阳光母题 SVG、品牌蓝实底 fab、2s 弹入（reduced-motion 关）、面板蓝头；文案全双语走 data-* 属性（greet/typing/err 随 locale），assistant.js 中文清零+死主题码删除；Consulenza 页内嵌完整对话确认不做（悬浮面板即全站对话入口，避免双聊天窗）
- [x] T3.2 客服通道：settings 四键（support_phone/email_info/email_service/whatsapp）+ src/support.js 公共模块；前台读取点全接（Consulenza/Assistenza/Contatti 卡片+移动速联条，未配置隐藏/在途提示）——后台编辑界面归 T3.5
- [x] T3.3 Agent API 双语化+全链路验证：POST /posts 新增 lang 参数（it/en 白名单，400 拒其余）+ SEO slug（标题变音符转写+时间戳后缀）+ Europe/Rome 发布日期 + 默认分类 Settore；评论回复作者 Alan→Convation、标注语言中立；docs/AGENT_API.md 更新（基址 convation.it、lang 约定、意语示例）。顺手根除 alan 种子：seedContent() 掏空 + 库内 4文/5工具/3课程/3案例按名点删，重启实证不重播、Notizie 双语空态上线。验证链=令牌认证→双语发文落草稿→模拟放行→IT/EN 列表双向隔离→详情 markdown→评论队列→回复上线（Convation+徽标）→409 防重→活动日志留痕→测试数据清场。注意：Windows Git Bash 下 curl 命令行带重音字符会按 ANSI 码页发送致乱码（实证 perch�），真实 Agent 走代码 POST 不受影响
- [x] T3.4 询价/报修/联系独立入库+可选 SMTP：inquiries 表（kind/name/email/phone/topic/body/lang/status）+ POST /api/inquiry（kind 白名单、意/英错误文案随 lang、限流 10/10min）+ mailer.notifyInquiry（收件人=support_email_info，SMTP 或邮箱未配置静默跳过、发送失败仅告警不阻断入库、replyTo=客户邮箱）；三表单（consulenza/assistenza/contatti）改传结构化字段，弃用 body 前缀打包。验证=curl 三态（200 入库/非法 kind 400 意语/坏邮箱 400 英语）+ 浏览器三表单实提交（成功文案回显+库内 4 行 kind/topic/lang 全对号+零控制台报错）+ 假 SMTP 实证 fail-safe（ECONNREFUSED 告警在日志、响应仍 200、行照存）→ 测试行按名点删清场。SMTP 真实凭据待用户提供（入 T5.3 催收）
- [x] T3.5 后台 Convation 化：品牌/标签双语（Convation Admin 侧栏、六 tab 中英并标、衬线字体全换 var(--font-heading)）；新增「询价线索 LEADS」面板（inquiries 列表+mailto+状态流转按钮）+ /admin/api/inquiry-status 端点（new/handled 白名单、404/400/未登录三拒）；内容管理裁为 Notizie 单类（课程/工具/案例前台无 DB 消费点，入口/筛选/表格行全撤，后端路由保留不接线）+ 语言列 IT/EN + 编辑器 lang 下拉；admin 发文/一键发布走共享 src/slug.js（意化 slug+罗马日期）+lang 入库（更新缺省保持原语言，防误重置——实测修过一次解构默认值反噬）；AI 生成草稿人设重写为 Convation Notizie 意语 prompt（it/en 可选、禁编造价格/税率、自由分类默认 Settore）；fmtDate/fmtDT/fmtNum/money 全转意式（DD/MM/YYYY + Europe/Rome + it-IT 千分位 + €）；seedAdmin 默认改 admin@convation.local/Convation。验证=两轮脚本 16/16+9/9 全过（临时换哈希登录→测毕恢复，不读凭据文件）：/admin 渲染、LEADS 入库→面板→状态流转 DB 证据、EN 文章创建/无 lang 编辑保持/前台双语隔离、发布罗马日期、测试行全清

### Phase 4: SEO/GEO
- [x] T4.1 SEO 页级标记：13 页 title/metaDesc 双语已在 P3 逐页落地（本轮复核）；head.ejs 新增 SEO 块（canonical + og:site_name/title/description/type/url/locale，typeof 守卫、admin 渲染不受影响）；JSON-LD 三处新增——首页 HVACBusiness（areaServed=Italy，地址/电话留 T5.3 素材到位再补，不编造）、Prodotti ItemList/Product（不挂 offer 不编价格）、文章页 Article（headline/datePublished/inLanguage/Organization 署名，ogType=article）；FAQ 页 FAQPage 已有（T2.x）。i18n.js 新增 siteBase（SITE_BASE 环境变量可覆盖）+ canonicalPath（自动去查询串）
- [x] T4.2 hreflang/sitemap/robots/llms.txt：head 每页输出 it/en/x-default 三连（x-default→意语版）；文章页特殊处理——canonical 归属文章语言路径（跨前缀访问不漂移，实证 /en/notizie/it-slug 仍指 /notizie/…）+ 无翻译对应故 noHreflang；src/routes/seo.js 三出口——sitemap.xml（13 静态页×双语各 26 条含 xhtml:link hreflang 对 + 已发布文章按所属语言单列带 lastmod；privacy/cookie 占位页不入图）、robots.txt（Disallow /admin /login /api/ + Sitemap 行）、llms.txt（llmstxt 惯例：公司简介+9 页导引+给 AI 代理的注意事项——价格税率不公开、引导 Contatti）。验证=脚本 19/19（直插文章行→各出口全出现→点删清场）；启动日志 Alan 残留顺手改 Convation
- [x] T4.3 CMP 横幅：views/partials/cookie-banner.ejs（原生三键 Rifiuta/Preferenze/Accetta 随 locale 双语、偏好面板两行=必要 always-on + 匿名统计 checkbox、存 localStorage cv-consent、页脚新增「Preferenze cookie」入口随时改主意）挂 tail.ejs（admin 不含 tail 不受扰）；analytics.js 重写为同意闸门——未表态/拒绝=零 sid 零请求，同意即刻补发当页 pageview（cv-consent-changed 事件），撤回删 cv-sid+旧 alan-sid；管辖范围只有首方匿名统计（会话 cookie 属技术必要不需同意，站内无广告画像）。验证=内置浏览器全链路：首访横幅意语三键+零存储→无 /api/track 请求→Accetta 后 consent/sid 落库+网络 204+DB 16→17→带同意刷新再+1（合法）→横幅静默+页脚重开偏好+撤回 sid 即删→EN 版英文文案+Reject 后 /en、/prodotti 零新增（DB 停 18）→控制台零报错

### Phase 5: 走查（⛔ 门禁二）
- [ ] T5.1 本地起服 → 内置浏览器双端截图对照 DESIGN.md，列 5 个具体问题
- [ ] T5.2 逐项修复 → 复查 → 用户点头
- [ ] T5.3 素材催收清单发用户（logo 透明版/反白版、产品图、案例照、P.IVA 法务数据）

### Phase 6: 收尾（部署另起任务）
- [ ] T6.1 README/CHANGELOG 重写为 convation 语境；deploy 脚本改域名端口（部署时再动）

## 上下文保留

### 接口协议
- Agent API：`/api/agent`（Bearer 令牌，见 docs/AGENT_API.md），小龙虾/hermes 供稿与评论自动回复走这里
- 客服通道 settings 键：后台可配，前台速联条/Assistenza/Contatti/页脚读取
- 工具externo：hvac.geopro.cc（卡片外链，后续可加更多）

### 技术决策
- 底座：Node20+Express4+EJS SSR+better-sqlite3（WAL），沿用 alan-platform 骨架
- 字体：@fontsource/archivo + inter 自托管（400/600/700），衬线全清
- 颜色 4 色封顶：#FAFAF8 纸白 / #1F2933 墨青(兼深带) / #0F4C8C 品牌蓝 / #E06B3A 行动橙（值以 DESIGN.md §3 为准）
- i18n：it 默认无前缀 + /en/ 前缀；后台英/中
- 圆角 6/8/0 三档；动效"少量点缀"档（§9）

### 环境配置
- 本地端口 8203（127.0.0.1）；.env.example 已就位
- 单次写入 ≤10k 字符；小步 commit；杀进程先 netstat 找 PID，禁按名杀

## 执行日志

### 2026-07-23 - 第 4 轮
**当前任务**: T3.5 完成（Phase 3 全绿）
**完成内容**: 后台 Convation 化全套（LEADS 面板+端点、内容管理 Notizie 单类+lang、AI 草稿意语人设、意式日期、seedAdmin）；共享 src/slug.js 抽出；两轮正向证据验证 16/16+9/9
**已知悬留**: login.ejs 仍 alan 样式（T5.1 走查一并看）；privacy/cookie 占位（T5.3 素材）；admin.js 内部标识 alanToast/alan-admin-tab 不改（不可见内部名）；课程/工具/案例后端路由保留未接线（前台无消费点，T6.1 收尾定去留）；dev 库既有管理员行仍 admin@alan-ai.local（凭据文件对应可登录，仅显示名改 Convation；生产首启即新默认）
**下一步**: Phase 4 SEO/GEO（T4.1 JSON-LD → T4.2 hreflang/sitemap → T4.3 CMP）

### 2026-07-22 深夜 - 第 3 轮
**当前任务**: T3.3 完成（Phase 2 全绿 + T3.1/T3.2/T3.3 全绿）
**完成内容**: 13 页全上线（T2.3–T2.9 逐页 commit）；助手改皮双语化（87b19fc）；Agent API 双语供稿链路打通并全链路实证；alan 种子内容根除（seedContent 掏空+按名点删，重启不重播）
**已知悬留**: fmtDate/fmtDT 仍是中式 YYYY.MM.DD + Asia/Shanghai 时区（意大利惯例 DD/MM/YYYY + Europe/Rome，归 T3.5/T5.1 一并处理）；login.ejs 仍 alan 样式；privacy/cookie 占位；admin 全未动；seedAdmin 默认管理员仍 alan 语境（归 T3.5）
**下一步**: T3.4 询价/报修独立表 + 可选 SMTP

### 2026-07-22 晚 - 第 2 轮
**当前任务**: T2.2 完成
**完成内容**: Phase 1 全绿（8397cdc/ee1185a/98eeeb3/cdb2780）；T2.2 首页 10 区上线：注册表双语键 ~50 个、home.ejs 9 区+页脚、site.css 首页样式+入场动效、site.js 三件套（fade-up/counter/助手唤起）、首页路由切 render('home')+metaDesc
**已知悬留**: 悬浮助手仍是 alan 中文版（T3.1 改皮）；数字带数值为设计样稿值待用户确认（T5.3 催收清单）
**下一步**: T2.3 Prodotti 页

### 2026-07-22 晚 - 第 1 轮
**当前任务**: T1.2
**完成内容**: DESIGN.md 门禁一确认（含 §6 改版：FAQ/Notizie 独立页+全站 AI 助手）；T1.1 fork 完成 commit 8397cdc
**下一步**: npm install 冒烟 → T1.3 ds.css token 重写
