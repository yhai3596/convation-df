#!/usr/bin/env bash
# ============================================================================
# Convation 「design-first 重做版」预览部署（新加坡机 43.156.58.154）
#   预览 URL → https://convation.geopro.cc     端口 8203
#
# ⚠ 与线上对照组严格隔离：线上 yhai3596/convation 跑在 convation.it:8202
#   （服务 convation / 目录 /var/www/convation / 证书 /etc/ssl/convation）。
#   本脚本所有资源一律用 ${SERVICE}=convation-df 前缀，绝不触碰上面任何一个。
#
# 控制台以 root 执行：
#   curl -fsSL https://raw.githubusercontent.com/yhai3596/convation-df/main/deploy/deploy-convation.sh | bash
#
# 幂等：可重复执行。切正式域名 www.convation.it 属对照组线上站的事，与本预览无关。
# 前置：本机已有 nginx、acme.sh（GoDaddy DNS-01 凭据在 ~/.acme.sh/account.conf）。
# ============================================================================
set -uo pipefail

SERVICE="convation-df"                # 全套资源前缀（服务/目录/证书/nginx/autopull），与线上 convation 隔离
SUB="convation"                       # 预览子域前缀（convation.geopro.cc，好记；与 convation.it 不同域不撞）
ZONE="geopro.cc"
DOMAIN="${SUB}.${ZONE}"               # convation.geopro.cc
APP_DIR="/var/www/${SERVICE}"         # /var/www/convation-df
REPO="https://github.com/yhai3596/convation-df.git"
BRANCH="main"
PORT=8203
CERT_DIR="/etc/ssl/${SERVICE}"        # /etc/ssl/convation-df
SERVER_IP="$(curl -s --max-time 8 ifconfig.me || echo 43.156.58.154)"

log() { echo -e "\n\033[1;33m==> $*\033[0m"; }

# --------------------------------------------------- 0. 安全护栏
# (a) 端口保护：8203 若被非本服务占用，停手
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT} " && ! systemctl is-active --quiet "${SERVICE}"; then
  echo "[ERROR] 端口 ${PORT} 已被其他服务占用，请换端口或先排查："; ss -ltnp | grep ":${PORT} " || true; exit 1
fi
# (b) 目录保护：绝不写进线上对照组目录
if [ "${APP_DIR}" = "/var/www/convation" ] || [ "${SERVICE}" = "convation" ]; then
  echo "[ERROR] 命名与线上对照组冲突，已中止（保护 /var/www/convation 与 convation.service）"; exit 1
fi

# --------------------------------------------------- 1. DNS
log "1/8 DNS：${DOMAIN} A -> ${SERVER_IP}（复用 acme.sh 里的 GoDaddy 凭据）"
GD_KEY=$(grep -oP "SAVED_GD_Key='?\K[^'\"]+" ~/.acme.sh/account.conf 2>/dev/null | head -1 || true)
GD_SECRET=$(grep -oP "SAVED_GD_Secret='?\K[^'\"]+" ~/.acme.sh/account.conf 2>/dev/null | head -1 || true)
if [ -n "${GD_KEY}" ] && [ -n "${GD_SECRET}" ]; then
  HTTP=$(curl -s -o /tmp/gd.out -w '%{http_code}' -X PUT \
    "https://api.godaddy.com/v1/domains/${ZONE}/records/A/${SUB}" \
    -H "Authorization: sso-key ${GD_KEY}:${GD_SECRET}" -H "Content-Type: application/json" \
    -d "[{\"data\":\"${SERVER_IP}\",\"ttl\":600}]")
  [ "$HTTP" = "200" ] && echo "${SUB} A 记录已指向本机" || echo "[WARN] DNS 设置失败 HTTP $HTTP：$(cat /tmp/gd.out)（可 GoDaddy 后台手动加 ${SUB} A -> ${SERVER_IP}）"
else
  echo "[WARN] 未找到 GoDaddy 凭据，请手动加 DNS：${SUB} A -> ${SERVER_IP}"
fi

# --------------------------------------------------- 2. Node.js
log "2/8 Node.js（>=20）"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | grep -oP '\d+' | head -1)" -lt 20 ]; then
  dnf -y module reset nodejs >/dev/null 2>&1 || true
  dnf -y module enable nodejs:22 >/dev/null 2>&1 || dnf -y module enable nodejs:20 >/dev/null 2>&1 || true
  dnf -y install nodejs npm || { echo "[ERROR] Node 安装失败"; exit 1; }
fi
echo "node $(node -v) / npm $(npm -v)"

# --------------------------------------------------- 3. 代码
log "3/8 拉取代码 -> ${APP_DIR}"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" pull --ff-only
else
  git clone --depth 1 -b "${BRANCH}" "${REPO}" "${APP_DIR}"
fi
cd "${APP_DIR}"

log "4/8 安装依赖（含字体自托管 postinstall）"
npm ci --no-audit --no-fund || npm install --no-audit --no-fund || { echo "[ERROR] npm 依赖安装失败"; exit 1; }

# --------------------------------------------------- 5. .env
log "5/8 生成 .env（已存在则保留）"
if [ ! -f "${APP_DIR}/.env" ]; then
  cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=production
PORT=${PORT}
HOST=127.0.0.1
SITE_BASE=https://${DOMAIN}
SITE_URL=https://${DOMAIN}
SITE_HOST=${DOMAIN}
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_EMAIL=admin@convation.local
# 可选增强（填好后 systemctl restart ${SERVICE} 生效）：
# Z_AI_API_KEY=      # 智谱 GLM Key（AI 助手/评论自动回复升级为 LLM 生成）
# LLM_BASE_URL=https://api.z.ai/api/paas/v4
# LLM_MODEL=glm-4.5-flash
# SMTP_HOST=         # 配好后前台询价/报修表单提醒邮件送达（收件人读后台 settings）
# SMTP_PORT=465
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=
EOF
  echo ".env 已生成（SESSION_SECRET 随机）"
else
  echo ".env 已存在，保留"
fi

# --------------------------------------------------- 6. systemd
log "6/8 配置 systemd 服务 ${SERVICE}.service"
cat > /etc/systemd/system/${SERVICE}.service <<EOF
[Unit]
Description=Convation design-first preview (IT/EN · ${DOMAIN})
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ${SERVICE}
sleep 2
systemctl restart ${SERVICE}
sleep 2
if curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" | grep -q 200; then
  echo "应用已监听 127.0.0.1:${PORT}"
else
  echo "[ERROR] 应用未正常启动：journalctl -u ${SERVICE} -n 50"; journalctl -u ${SERVICE} -n 30 --no-pager; exit 1
fi

# --------------------------------------------------- 7. 证书 + nginx（只管本子域）
log "7/8 签发证书（${DOMAIN}）并配置 nginx"
mkdir -p "${CERT_DIR}"
HAS_CERT=0
if [ -s "${CERT_DIR}/${SERVICE}.cer" ] && openssl x509 -in "${CERT_DIR}/${SERVICE}.cer" -noout -text 2>/dev/null | grep -q "DNS:${DOMAIN}"; then
  HAS_CERT=1; echo "证书已存在"
else
  ~/.acme.sh/acme.sh --issue --dns dns_gd -d "${DOMAIN}" --server letsencrypt --force && \
  ~/.acme.sh/acme.sh --install-cert -d "${DOMAIN}" \
    --fullchain-file "${CERT_DIR}/${SERVICE}.cer" \
    --key-file "${CERT_DIR}/${SERVICE}.key" \
    --reloadcmd "nginx -s reload" && HAS_CERT=1
  [ "$HAS_CERT" = "1" ] || echo "[WARN] 证书签发失败，先以 HTTP 提供服务；稍后重跑本脚本重试"
fi

# 预览域整站 noindex：不被搜索引擎收录，不与线上 convation.it 抢排名
if [ "$HAS_CERT" = "1" ]; then
  cat > /etc/nginx/conf.d/${SERVICE}.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://${DOMAIN}\$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};
    ssl_certificate ${CERT_DIR}/${SERVICE}.cer;
    ssl_certificate_key ${CERT_DIR}/${SERVICE}.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 2m;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
  cat > /etc/nginx/conf.d/${SERVICE}.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 2m;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi
nginx -t && nginx -s reload && echo "nginx 已加载 ${DOMAIN} 站点"

# --------------------------------------------------- 8. autopull
log "8/8 安装 autopull（每分钟自动拉取，代码变更自动重启）"
install -m 0755 "${APP_DIR}/deploy/autopull-convation.sh" /usr/local/bin/${SERVICE}-autopull.sh
cat > /etc/systemd/system/${SERVICE}-autopull.service <<EOF
[Unit]
Description=${SERVICE} auto git pull

[Service]
Type=oneshot
ExecStart=/usr/local/bin/${SERVICE}-autopull.sh
EOF
cat > /etc/systemd/system/${SERVICE}-autopull.timer <<EOF
[Unit]
Description=Run ${SERVICE}-autopull every minute

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=false

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now ${SERVICE}-autopull.timer

# --------------------------------------------------- 完成
log "部署完成"
echo "预览站点：$([ "$HAS_CERT" = "1" ] && echo https || echo http)://${DOMAIN}"
echo "服务：systemctl status ${SERVICE} | 日志：journalctl -u ${SERVICE} -f"
echo "自动更新：本地 git push 后 1 分钟内生效（日志 /var/log/${SERVICE}-autopull.log）"
echo "线上对照组不受影响：convation.it:8202 / convation.service / /var/www/convation 均未触碰"
if [ -f "${APP_DIR}/data/admin-credentials.txt" ]; then
  echo; echo "★ 管理员初始账号（请登录后妥善保存）："
  cat "${APP_DIR}/data/admin-credentials.txt"
fi
