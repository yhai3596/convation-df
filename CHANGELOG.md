# CHANGELOG

## v1.3.3 — 2026-07-20

**工具集新增 3 款工具**（种子同步；线上另经后台生效）：

- № 02「AHRI 竞品分析」：填 url `https://ahri.geopro.cc`，简介改为「基于 AHRI 认证数据的竞品数据查询与竞品动态跟踪」。
- № 04「专利 AI 辅助助手」：填 url `https://aipatent.lovable.app`，简介改为「AI 辅助的专利技术交底书撰写系统」。
- № 05「企业财报解读」（**新增**）：url `https://finstar.geopro.cc`，企业财报解读与财务分析训练室。
- **只改 `src/db.js` 种子＝仅对全新部署生效**：`seedContent()` 有「`posts` 非空即早退」守卫（db.js:170），线上库早已 seed，`git push` 不会重跑种子。线上 3 张卡由管理员在 geopro.cc 后台「内容管理」手动更新（编辑 № 02/№ 04、新建 № 05；url 须含 `https://`，否则被后端校验拒绝）——数据与代码两套，互不覆盖。

## v1.3.2 — 2026-07-17

**新增异地拉取脚本** `scripts/pull-backups.js`（`npm run pull-backups`）：

- **动机**：`backup-db.js` 的备份与数据库同机同盘，只防误删改错，防不了整机故障。本机即天然异地点。
- 默认先 ssh 让服务器生成最新备份，再拉取本地缺失的（`--no-fresh` 可跳过）。落 `data/backups-remote/`，与本地备份 `data/backups/` 分开存，保留最近 30 份（`--keep` 可调）。
- **用 scp 不用 rsync**：本机（Windows）无 rsync，ssh/scp 是 Win10+ 自带 OpenSSH。增量比对由脚本按文件名做——备份名含 UTC 时间戳且内容不可变，文件名即身份。
- **先落 `.part`、校验通过才改名**：否则 scp 中断留下的半截文件会因文件名对得上而被永久当作「已拉取」跳过，那份备份就悄悄丢了。每份拉回后做 `integrity_check` + 非空校验，不合格即丢弃并非零退出。
- `BatchMode=yes` 认证失败即退（无人值守不卡在密码提示）；指定 `--key` 时带 `IdentitiesOnly=yes`，避免轮试本机所有密钥触发服务端 MaxAuthTries。
- 未授权时不抛 ssh 原始报错，而是打印**已填好本机公钥**的授权命令，可直接粘到云控制台执行。
- **已测**：连接失败路径（Permission denied → 输出可执行的修复指引，退出码 1）、主机不可达（干净超时不挂死）。
  **未测**：拉取主流程（列远端→比对→scp→校验→保留）——本机公钥尚未授权到服务器，无 SSH 通道，待授权后补真实端到端验证。

## v1.3.1 — 2026-07-17

**新增数据库备份脚本** `scripts/backup-db.js`（`npm run backup`）：

- **动机**：库跑在 WAL 模式，主文件 `app.db` 仅 4KB 而 `app.db-wal` 有 2.3MB。实测 `cp app.db` 得到的副本**能正常打开但 0 表 0 行**——一个看着像备份、实则全空的文件，比没有备份更危险。
- 走 SQLite **Online Backup API**（非 `sqlite3` CLI——服务器上未必装，而 better-sqlite3 是既有依赖自带引擎）：服务运行中热备、无需停服，WAL 内容一并合并。已在并发 1526 次写入下验证。
- **自校验**：备份后做 `integrity_check` + 非空校验，不合格即删除并非零退出（cron 可据此告警）。坏备份留着比没有更危险。
- **单文件即完整**：备份后转 `journal_mode=DELETE`，产物不带 `-wal`/`-shm` 伴生文件，可直接 scp 单个文件交付；恢复后由 `src/db.js` 启动时自动设回 WAL。附自愈逻辑：目录内遗留的 WAL 态备份会被并回单文件（先并数据再删伴生，不丢内容）。
- 保留最近 N 份（默认 14，`--keep` 可调），自动清理旧备份与孤儿伴生文件。备份落 `data/backups/`（已被 gitignore 覆盖）。
- 脚本**不 require `src/db.js`**——那会触发建表/迁移/种子等副作用，备份须只读零副作用（路径口径与 `src/db.js:8` 保持一致）。
- README 新增「数据库与备份」章节：路径说明、cron 用法、恢复步骤。**已做恢复演练**：备份复制为 `app.db` 拉起独立实例，前台内容/用户账号/登录能力完整恢复。

## v1.3.0 — 2026-07-17

**后台内容管理优化**（用户实测反馈）：

- **误删保护**：课程/工具/案例原为**直接物理删除，唯一防线是一个 confirm 弹窗**。现四类内容统一两段式——首次点「下线」= 归档（前台立即隐藏，文章保留评论与统计），归档态再点「删除」才彻底移除。新增 `POST /admin/api/restore` + 行内「恢复」按钮（文章仍走「编辑→状态→已发布」，与原有 `post-publish` 一致）。
  - 用新列 `archived INTEGER NOT NULL DEFAULT 0`（courses/tools/cases），**不复用 `status`**——后者已表示业务态（`live` = 已上线 / `coming` = 筹备中），复用会让「归档」和「筹备中」互相打架。两套状态正交：归档再恢复，原 `status` 不变。
  - 迁移走既有幂等 `addColumn`，线上库只加列；前台 `/cases`、`/courses`、`/tools` 三处查询加 `WHERE archived=0`。
- **新建入口**：点「新建内容」原先弹浏览器原生 `prompt` 让用户手输数字选类型（`1=文章 2=课程 3=工具 4=案例`），与站点设计语言不符且易误输。改为下拉菜单直接点选，支持 aria 属性、点击外部关闭、Esc 关闭。

## v1.2.1 — 2026-07-17

**评论体验优化**（用户实测反馈）：

- **发布延迟**：原先评论 POST 同步等待 Agent 生成回复（配 LLM 后要等数秒网络请求）才返回。改为**评论立即入库并返回**（实测 10ms / 前端 183ms 出现），Agent 回复转后台异步执行，失败由站内 Worker 补处理。
- **自动回复可见性**：新增 `GET /api/comments/:id/reply-status`；前端发表后即时追加评论卡片，并轮询回复状态——回复到达即渲染；若 Agent 判定非常见问题则显示「已转 Alan 本人回复」（原先静默跳过，让人误以为功能坏了）；超时提示刷新可见。
- 静态资源加版本号（`?v=assetVer`，进程启动时间戳）防浏览器缓存旧 JS/CSS 导致新按钮无响应。

## v1.2.0 — 2026-07-17

**多 LLM + 故障自动切换**：后台可配置一组 LLM（顺序=优先级），调用时依次尝试，任一路失败（网络/HTTP/空响应）自动切下一路，全失败才回退内置模板/FAQ。

- config.js：provider 列表 CRUD（增删改/启停/排序），旧单配置首次读取自动迁移为 provider（不丢已配好的）；key 脱敏、传空保留原值。
- llm.js：chat() 按 activeProviders 顺序故障切换，切换/失败写活动日志；testConnection 可测指定 provider 或临时输入；沿用双端点识别（OpenAI/Anthropic）。
- 后台「智能助理」LLM 卡片改为 provider 表（优先级/名称/模型/Base/脱敏key/启停/测试/上下移/删除）+「添加 LLM」（先测试再添加）。
- 验证：迁移/多provider/排序/启停/故障切换 5 项逻辑测试通过 + 后台渲染与 API 实测 200。

## v1.1.0 — 2026-07-17

后台管理与 Agent 自动化大升级（Phase A–F 全部落地：后端 + 界面 + 文档）。从「有引擎没方向盘」到全部接通。

### 新增能力
- **A · 全内容 CRUD + 删除**：案例增删改（原缺失）；文章"下线=归档软删（保留评论/统计），再删=彻底移除"，课程/工具/案例硬删+二次确认。
- **B · 配置底座**：后台可填 LLM key / Base / 模型 + "测试连接"（存 settings，即时生效，Key 只存服务端脱敏回显）；Agent 双模式开关（评论自动回复 / 内容审核制）+ 巡检间隔。`src/config.js` 承载。
- **C · AI 文章草稿 + 审核发布流**：后台一键"AI 生成草稿"（LLM，选题→标题/摘要/正文/分类），入草稿待审队列，预览 + 一键发布。
- **D · 诊断知识库后台可编辑**：结合点清单（4 痛点域）/ 基础评语 / 三阶段模板 / 摘要模板搬进 DB，后台编辑器可改可恢复默认；`report.js` 读 DB，内置常量兜底。
- **E · Agent API + 令牌 + 站内自动化 Worker**（从"有效管理"视角重设计为双轨）：
  - 站内 Worker（`src/worker.js`，零外部依赖）进程内定时巡检未回复评论→自动回帖，含失败退避、开关关闭期间积压补处理、心跳；
  - 对外 Agent API（`src/routes/agent-api.js`）：Bearer 令牌认证（哈希存储/只显示一次/可吊销），端点 /status /posts（受审核制约束→草稿）/comments（拉队列）/comments/:id/reply（自动上线）/messages；
  - 后台「智能助理」页：状态总览 + 队列 + 模式开关 + LLM 配置 + 令牌管理 + 活动日志（全部动作留痕 `agent_activity`）；
  - `docs/AGENT_API.md` + `/docs/agent-api` 在线文档（含轮询值守脚本示例）。
- **F · 全站文案键值化 + 图片上传**：`src/content.js` site_content 键值层（68 个可编辑块，默认=设计稿文案，清空回落默认）；8 个前台页文案改为 `ct()/ctBr()/ctImg()`；后台「页面内容」分组编辑 + 图片上传（multer，案例/课程封面/培训照片/头像）。

### 架构/工程
- 后台界面拆为分片 include（admin-content/pages/agent/kb），避免单文件过大。
- DB 增量迁移（幂等加列 posts.created_by / comments.agent_status / courses.cover_url），兼容既有线上库。
- `content.save` 拒绝含 U+FFFD 的脏输入（防编码损坏入库）。

### 验证
本地冒烟 14/14；后台五页签浏览器实测（页签切换、内容/案例 CRUD+删除、AI 草稿、页面文案保存、LLM 配置、令牌生成、知识库编辑）；Agent API 端到端（建令牌→status→发文入草稿）；前台 8 页零乱码；错误日志干净。


## v1.0.1 — 2026-07-15

部署目标从 alan.geopro.cc 改为**主域名 geopro.cc**（用户指示：替换该域名下的旧站——Vercel 托管的默认 Next.js 页）。

- deploy-alan-sg.sh：DNS 改写 `@`(apex) A 记录 + `www` CNAME→`@`（替换原 Vercel 指向）；证书含 www SAN；
  nginx www→apex 规范 301；幂等停用本机其他占用主域名的旧 server 块（不碰 hvac.geopro.cc）
- 应用侧：SITE_URL/SITE_HOST 默认与来源归因白名单改为 geopro.cc/www.geopro.cc
- 文档同步（README / DEPLOY.md / .claude）；hvac.geopro.cc 子域完全不受影响

## v1.0.0 — 2026-07-15

首个完整版本：按设计交付包（design_handoff_alan_platform，Classical 设计系统）1:1 重实现并补齐真实后端。

### 新增
- **前台 11 页**：Home / About / Services / Tools / Blog / Article / Cases / Courses / Diagnosis / Login / 404，共享导航与页脚，字体全部自托管（国内可达）
- **企业 AI 诊断**：5 题问卷状态机（进度 n/6、选中态、可回退）→ 企业信息 → 报告（成熟度 L1–L5 按 Q2 定级、结合点清单按 Q3 痛点域从知识库取 5+Q1+Q4 条、三阶段路径关联 Q5 目标）；提交入库，SMTP 配置后自动邮件
- **Agent 能力**（设计稿中的小龙虾/Hermes 职责）：
  - 评论自动回复：FAQ 关键词匹配即时回复并标注「AI 自动回复 · via 小龙虾」，其余转人工；后台可开关
  - 智能客户助手：全站悬浮，3 个快捷问题走设计稿标准答案，自由问答 FAQ 兜底
  - 可选 LLM 增强：配 `Z_AI_API_KEY` 后报告摘要/助手/自动回复升级为 GLM 生成（超时/失败自动回退模板，回答约束在站内知识）
- **主题系统**：4 套配色（鎏金纸本/黛青石墨/赭墨陶土/极简银白·Apple风）localStorage 全站同步，助手面板内切换，head 同步应用防闪烁
- **认证**：邮箱+密码注册登录（bcrypt、会话 SQLite 存储、限流），admin/member 角色
- **埋点与看板**：pageview/tool_click/漏斗事件/文章完读（IntersectionObserver 哨兵），管理后台真实聚合：PV/UV+环比、每日趋势 SVG 双折线、来源会话首触归因、工具排行、注册转化漏斗、文章 Top5 完读率
- **管理后台**：三页签（数据看板/内容管理/用户管理），文章/课程/工具的新建与编辑（对话框表单）、Agent 自动化状态与开关、诊断提交记录、站内留言、用户列表与搜索
- **部署包**：deploy-alan-sg.sh（DNS→Node→克隆→env→systemd→acme 证书→nginx→autopull 一键完成，幂等）、autopull-alan.sh（每分钟拉取，deps 变更自动 npm ci）
- **测试**：scripts/smoke.js 冒烟（9 页 + 4 API + 权限跳转 + 404）

### 技术决策
- Express + EJS 服务端渲染而非 SPA：设计稿为纯 HTML，1:1 移植保真度最高；SQLite 替代 PostgreSQL：单机零运维（见 .claude/DECISIONS.md D1/D2）
- 字体不走 Google Fonts（国内不可达），fontsource 按 unicode-range 分片自托管，仅保留 CSS 引用的 400/600 分片（6.1MB）
- 生产不注入演示数据；本地 `SEED_DEMO=1` 提供全套演示内容

### 已知边界（v1 有意为之）
- 课程支付、微信登录、密码找回：界面就位、后端预留（点击有明确提示），待接入支付/OAuth 后开通
- 文章草稿生成（小龙虾 CLI）：后台显示「预留接口」
- AHRI/北美竞品/专利三个工具：登录后显示"接入中"，待工具服务就绪后在后台填入 URL 即可上线（HVAC Tool 已链接 hvac.geopro.cc）
