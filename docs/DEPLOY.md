# 部署与运维手册（geopro.cc）

目标机：腾讯云新加坡 `43.156.58.154`（OpenCloudOS 9.6，与 hvac.geopro.cc 同机）。
**该机对外 SSH 被网络路径拦截（详见 hvac 运维记录），一切服务器操作走腾讯云控制台网页终端。**

## 一、首次部署（一条命令）

**步骤 0（一次性决定）**：仓库当前为 **private**。autopull 部署模式要求服务器能匿名拉取
（与 hvactool 相同），执行部署前请先把仓库设为 public：
GitHub → Settings → Danger Zone → Change visibility → Public
（或本机执行 `gh repo edit yhai3596/alan-platform --visibility public --accept-visibility-change-consequences`）。
仓库内不含任何密钥（.env 在 .gitignore），公开的只是代码与站点文案。
若坚持 private：需改用 PAT 认证的 remote 并手动粘贴部署脚本内容执行，见文末附录。

控制台网页终端（root）执行：

```bash
curl -fsSL https://raw.githubusercontent.com/yhai3596/alan-platform/main/deploy/deploy-alan-sg.sh | bash
```

脚本步骤（幂等，可重复执行）：
1. **DNS（替换旧站指向）**：读取服务器上 acme.sh 已存的 GoDaddy 凭据，PUT `@`(apex) A → 服务器IP、`www` CNAME → `@`（TTL 600）。此前 geopro.cc/www 指向 Vercel 上的旧站（默认 Next.js 页），切换后旧站自然断流——Vercel 项目本身不受影响，可日后在 Vercel 后台解绑域名或删除
2. **Node**：dnf module nodejs:22（回退 :20）
3. **代码**：clone/pull 到 `/var/www/alan`
4. **依赖**：`npm ci`（postinstall 自动生成 `public/vendor` 字体）
5. **.env**：生成随机 `SESSION_SECRET`（已存在则不动）
6. **systemd**：`alan.service`（127.0.0.1:8201，Restart=always），启动并健康检查
7. **证书 + nginx**：先停用本机其他占用主域名的旧 server 块（不碰 hvac.geopro.cc），acme.sh DNS-01（dns_gd）签发 `geopro.cc`+`www.geopro.cc` 双域名证书装到 `/etc/ssl/alan/`（acme.sh cron 自动续期）；nginx：80 与 443 的 www 一律 301 到 `https://geopro.cc`，apex 443 反代 8201（转发 X-Forwarded-Proto）。证书签发失败则先出 HTTP 站，重跑脚本重试
8. **autopull**：`alan-autopull.timer` 每分钟 `git pull`，代码变更自动重启（deps 变更先 `npm ci`）
9. **DNS 生效时间**：A 记录切换后全球生效通常几分钟～1 小时（原记录 TTL 决定）；期间访问可能仍到旧站，属正常

结束时打印**管理员初始密码**（`/var/www/alan/data/admin-credentials.txt`）——请立即登录 `/admin` 验证并妥善保存。

## 二、日常更新

本机改代码 → `git push` → 服务器 1 分钟内自动生效。
- 日志：`tail -f /var/log/alan-autopull.log`（`[UPD]`/`[WARN]` 行）
- **仓库必须保持 public**（匿名 https pull；改 private 会静默失败）
- `deploy/autopull-alan.sh` 本身改动不会自动应用运行副本，需控制台重新执行：
  `install -m 0755 /var/www/alan/deploy/autopull-alan.sh /usr/local/bin/alan-autopull.sh`

## 三、可选增强（改 `/var/www/alan/.env` 后 `systemctl restart alan`）

| 能力 | 配置 | 效果 |
|---|---|---|
| LLM 生成 | `Z_AI_API_KEY=…`（Z.AI/智谱 GLM Key；国内版加 `LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4`） | 诊断报告摘要、助手问答、评论自动回复升级为 LLM 生成（站内知识约束，失败自动回退模板/FAQ） |
| 报告邮件 | `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS` | 诊断报告自动发送到填写邮箱；诊断页文案自动切换为"发送至邮箱" |
| 管理员 | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 覆盖默认管理员（仅首次建库时生效；改密码需删库重建或直接改表） |

## 四、常用运维

```bash
systemctl status alan            # 状态
journalctl -u alan -f            # 应用日志
node /var/www/alan/scripts/smoke.js http://127.0.0.1:8201   # 冒烟回归
sqlite3 /var/www/alan/data/app.db '.tables'                 # 查库（只读谨慎）
cp /var/www/alan/data/app.db /root/backup/app-$(date +%F).db  # 备份（单文件即全量）
```

- 数据全在 `/var/www/alan/data/`（app.db + admin-credentials.txt），**不在 git 内**；重装前先备份
- 回滚：`cd /var/www/alan && git reset --hard <旧commit> && systemctl restart alan`（autopull 下次 pull 会 ff-only 失败并告警，届时再 `git pull` 恢复跟踪）
- 证书：acme.sh 自动续期（`~/.acme.sh/` cron），与 hvac 证书同机制，无需人工

## 五、验收清单（部署后逐项过）

- [ ] https://geopro.cc 首页正常（鎏金纸本主题、字体为衬线）
- [ ] 诊断问卷全流程 → 报告卡出现，后台「用户管理→诊断提交记录」有记录
- [ ] 注册一个会员账号 → 文章页发评论（含"AHRI/热泵"字样）→ 收到「AI 自动回复 · via 小龙虾」
- [ ] 助手 3 个快捷问题回答正常；主题切换 4 套并刷新后保持
- [ ] /admin 用初始密码登录 → 看板有数据、内容可编辑保存
- [ ] `node scripts/smoke.js` 全绿

## 附录：坚持 private 仓库的部署方式

1. GitHub 生成 fine-grained PAT（仅此仓库、只读 Contents 权限）
2. 控制台把部署脚本内容整体粘贴执行（不能用 curl raw 一键）
3. 克隆后改 remote：`git -C /var/www/alan remote set-url origin https://<PAT>@github.com/yhai3596/alan-platform.git`
4. 其余步骤相同；PAT 过期前需更换
