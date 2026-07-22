# Alan 个人IP与AI工具平台（HVAC × AI）

Alan 的个人品牌综合平台：个人 IP、企业 AI 服务（B2B）、AI 工具集、AI 课程、案例培训展示与博客，
配套管理后台（内容管理、Agent 自动化、数据看板、用户管理）。

- 线上：https://geopro.cc
- 设计来源：`E:\AICoding\websites\个人IP与AI工具网站规划\design_handoff_alan_platform`（Classical 设计系统高保真稿，1:1 重实现）

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 服务端 | Node.js 20+ / Express 4 | 服务端渲染（EJS），监听 127.0.0.1:8201，nginx 反代 |
| 数据库 | SQLite（better-sqlite3, WAL） | 单文件 `data/app.db`，零运维；会话同库 |
| 前端 | 原生 JS + Classical 设计系统 CSS | 无构建步骤；字体自托管（Cormorant Garamond / Lora / Noto Serif SC，国内可达） |
| AI | 内置模板与 FAQ；可选 GLM 增强 | 配 `Z_AI_API_KEY` 后诊断报告/助手/评论自动回复升级为 LLM 生成，失败自动回退 |
| 邮件 | 可选 SMTP（nodemailer） | 配好后诊断报告自动送达；未配置则入库待查 |

## 功能

- **前台 11 页**：首页 / 关于 / 企业AI服务 / 工具集 / AI课程 / 案例·培训 / AI资讯（博客+文章详情）/ 企业AI诊断 / 登录注册 / 404
- **企业 AI 诊断**：5 题问卷 → 企业信息 → Hermes Agent 生成报告（成熟度 L1–L5、按痛点定制的 AI 结合点清单、三阶段路径），入库 + 可选邮件
- **评论 + Agent 自动回复**：登录后评论；常见问题由「小龙虾」即时回复并标注，其余转人工；后台可开关
- **智能客户助手**：全站悬浮组件，快捷问题 + 自由问答（FAQ/LLM），内含主题切换
- **主题**：鎏金纸本 / 黛青石墨 / 赭墨陶土 / 极简银白·Apple 风，localStorage 全站同步
- **埋点与看板**：PV/UV/趋势/来源（会话首触归因）/工具排行/注册漏斗/文章完读率
- **管理后台**（仅 admin）：数据看板、内容管理（文章/课程/工具 CRUD + Agent 开关）、用户管理、诊断提交与留言查看

## 本地开发

```bash
npm install          # postinstall 自动复制自托管字体到 public/vendor
npm run dev          # SEED_DEMO=1 启动（注入演示数据），http://127.0.0.1:8201
npm start            # 生产模式启动（无演示数据）
npm run smoke        # 冒烟测试（需服务运行中）
```

管理员：首次启动自动生成，见 `data/admin-credentials.txt`（或用 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 环境变量指定）。

## 部署（新加坡服务器，与 hvac.geopro.cc 同机同模式）

首次部署：腾讯云控制台网页终端（root）执行

```bash
curl -fsSL https://raw.githubusercontent.com/yhai3596/alan-platform/main/deploy/deploy-alan-sg.sh | bash
```

脚本自动完成：DNS A 记录（GoDaddy API）→ Node 安装 → 克隆 → 依赖 → .env → systemd(alan.service) → acme.sh 证书 → nginx vhost → autopull 定时器。

日常更新：本机 `git push` 后 1 分钟内服务器自动拉取并重启（`/var/log/alan-autopull.log`）。
**前提：本仓库保持 public**（服务器匿名 https pull）。

详细运维手册见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 目录结构

```
server.js            入口（Express 装配）
src/
  db.js              schema + 内容种子（含 SEED_DEMO 演示数据）
  report.js          诊断报告生成器（规则模板 + 可选 LLM 增强）
  agent.js           助手应答 / 评论自动回复（FAQ + 可选 LLM）
  analytics.js       埋点写入与看板聚合
  mailer.js          可选 SMTP 报告邮件
  llm.js             GLM 客户端（未配置即禁用）
  routes/            pages(前台) / api(JSON) / admin(后台)
views/               EJS 模板（partials + 12 页）
public/              ds.css(设计系统原样) site.css(页面层) js/ assets/ vendor/(字体,构建产物)
deploy/              deploy-alan-sg.sh(一键部署) autopull-alan.sh
scripts/             copy-fonts.js(postinstall) smoke.js backup-db.js(数据库备份)
```

## 数据库与备份

SQLite 单文件，位于 `<DATA_DIR>/app.db`（`DATA_DIR` 默认 = 项目根 `data/`，线上即 `/var/www/alan/data/app.db`）。
`data/` 在 .gitignore 中——**数据库不入库，本地与线上是两套独立数据**；部署走 `git pull` 只更新代码，`data/` 原地保留。

**备份必须用脚本，不能 `cp app.db`**：库跑在 WAL 模式，新数据先落 `app.db-wal`，未 checkpoint 前主文件几乎是空的。
实测直接拷贝主文件得到的副本**能正常打开、但 0 表 0 行**——比没有备份更危险。

```bash
npm run backup                      # 备份到 data/backups/app-YYYYMMDD-HHMMSS.db（UTC），默认保留最近 14 份
node scripts/backup-db.js --keep 30 # 自定义保留份数
node scripts/backup-db.js --dir /mnt/backup   # 自定义目录
```

脚本走 SQLite Online Backup API：**服务运行中可直接跑，无需停服**（已在并发写入下验证）；备份后自动做完整性校验与非空校验，
不合格即删除并以非零码退出（cron 可据此告警）；产物转为单文件形态，可直接 scp 单个文件交付。

服务器上按天备份（cron）：

```bash
0 4 * * * cd /var/www/alan && /usr/bin/node scripts/backup-db.js >> /var/log/alan-backup.log 2>&1
```

**恢复**：停服 → 删除 `app.db`、`app.db-wal`、`app.db-shm` → 把备份文件复制为 `app.db` → 启动（应用会自动转回 WAL 模式）。
已做恢复演练验证：前台内容、用户账号、登录能力均随备份完整恢复。

### 异地拉取（本机 = 异地备份点）

上面的备份与数据库**同机同盘**，只能防误删改错，防不了整机故障。`pull-backups.js` 把服务器备份拉到本机补上这一环：

```bash
npm run pull-backups                          # 服务器先生成新备份，再拉取本地缺失的
node scripts/pull-backups.js --no-fresh       # 只拉服务器已有的，不新生成
node scripts/pull-backups.js --dir D:/备份 --keep 60
```

默认落 `data/backups-remote/`（与本地备份 `data/backups/` 分开存，互不干扰），保留最近 30 份。
每份拉回后立即做完整性与非空校验，不合格即丢弃；拉取中先落 `.part` 临时文件、校验通过才改名，
避免中断留下的半截文件因文件名对得上而被永久当作「已拉取」跳过。

**前置：本机公钥需已授权到服务器。** 在云控制台的网页终端执行一次（仅需一次）：

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "<本机 ~/.ssh/id_ed25519.pub 的内容>" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
```

未授权时脚本会直接把这段命令（已填好本机公钥）打印出来。服务器信息可用 `--host/--user/--key` 或
`ALAN_SSH_HOST/ALAN_SSH_USER/ALAN_SSH_KEY` 覆盖，默认 `root@43.156.58.154`。
用 scp 而非 rsync：Windows 本机无 rsync，ssh/scp 是 Win10+ 自带；增量比对由脚本按文件名做（备份名含时间戳、内容不可变）。

## 环境变量

见 [.env.example](.env.example)。关键项：`SESSION_SECRET`（必配）、`Z_AI_API_KEY`（可选 LLM）、`SMTP_*`（可选邮件）。
