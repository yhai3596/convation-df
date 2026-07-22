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
- [ ] T1.5 i18n 机制：意语默认 + /en/ 前缀路由中间件；文案走键值层（it/en 两套），后台可改
  - 完成标准: 同一 view 渲染两语言；hreflang 互指；后台英/中界面不受影响

### Phase 2: 前台 13 页（每页一个可验证单元，逐页 commit）
- [ ] T2.1 partials：nav（6 项+Area installatori 按钮，sticky 72→60px）、footer（墨青四栏+法务占位）、head/tail
- [ ] T2.2 Home 10 区（DESIGN.md §6 顺序：Hero/服务三卡/产品两类/深色数字带/Detrazioni 条/案例三卡/安装工深带/AI+FAQ 精选/联系速通/页脚）
- [ ] T2.3 Prodotti（两大类+详情模板，多品牌）
- [ ] T2.4 Chi siamo / Referenze / Documentazione
- [ ] T2.5 Notizie（文章列表+详情+评论，数据层沿用骨架 posts）
- [ ] T2.6 FAQ（三组问答+JSON-LD FAQPage）/ Consulenza（整页 AI 对话+人工通道+询价表单）
- [ ] T2.7 Strumenti（工具卡片，先 hvac.geopro.cc）/ Assistenza（质保/保养/报修通道）
- [ ] T2.8 Detrazioni e incentivi / Contatti（表单+法务）/ Area installatori（注册登录，资质审核预留位）
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

### 2026-07-22 晚 - 第 1 轮
**当前任务**: T1.2
**完成内容**: DESIGN.md 门禁一确认（含 §6 改版：FAQ/Notizie 独立页+全站 AI 助手）；T1.1 fork 完成 commit 8397cdc
**下一步**: npm install 冒烟 → T1.3 ds.css token 重写
