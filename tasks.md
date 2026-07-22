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
- [ ] T2.9 移动端底部速联条（读后台 settings，未配置通道自动隐藏）

### Phase 3: 功能接线
- [ ] T3.1 AI 助手气泡改皮：logo 气泡+阳光母题图标，2s 弹入动效，全站常驻
- [ ] T3.2 客服通道 settings 键值（info 邮箱/售后邮箱/电话/WhatsApp）+ 前台读取点接线
- [ ] T3.3 Agent API 验证：小龙虾/hermes Bearer 令牌发文→Notizie 出现（草稿审核开关沿用）
- [ ] T3.4 询价单/报修表单入库+可选 SMTP
- [ ] T3.5 后台：英/中双语界面、token 同步换色、内容管理适配 13 页文案键

### Phase 4: SEO/GEO
- [ ] T4.1 每页 title/description、JSON-LD（HVACBusiness/Product/FAQPage）、语义化标题
- [ ] T4.2 hreflang it/en、sitemap.xml、robots、llms.txt
- [ ] T4.3 CMP 横幅（原生极简三键：拒绝/接受/偏好，意/英双语）

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

### 2026-07-22 晚 - 第 2 轮
**当前任务**: T2.2 完成
**完成内容**: Phase 1 全绿（8397cdc/ee1185a/98eeeb3/cdb2780）；T2.2 首页 10 区上线：注册表双语键 ~50 个、home.ejs 9 区+页脚、site.css 首页样式+入场动效、site.js 三件套（fade-up/counter/助手唤起）、首页路由切 render('home')+metaDesc
**已知悬留**: 悬浮助手仍是 alan 中文版（T3.1 改皮）；数字带数值为设计样稿值待用户确认（T5.3 催收清单）
**下一步**: T2.3 Prodotti 页

### 2026-07-22 晚 - 第 1 轮
**当前任务**: T1.2
**完成内容**: DESIGN.md 门禁一确认（含 §6 改版：FAQ/Notizie 独立页+全站 AI 助手）；T1.1 fork 完成 commit 8397cdc
**下一步**: npm install 冒烟 → T1.3 ds.css token 重写
