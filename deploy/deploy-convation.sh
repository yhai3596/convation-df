#!/usr/bin/env bash
# ============================================================================
# Convation 预览部署（新加坡机 43.156.58.154 · 与 alan/hvac 同机共存）
#   → https://convation.geopro.cc
#
# 控制台以 root 执行（与 alan/hvac 相同方式）：
#   curl -fsSL https://raw.githubusercontent.com/yhai3596/convation/main/deploy/deploy-convation.sh | bash
#
# 幂等：可重复执行。独立端口 8203 / 独立服务 convation / 独立子域，
# 完全不碰 alan(8201, geopro.cc apex) 与 hvac(hvac.geopro.cc) 的任何配置。
# 前置：本机已有 nginx、acme.sh（GoDaddy DNS-01 凭据在 ~/.acme.sh/account.conf）。
# 切正式域名 www.convation.it：另起一版脚本（改 DOMAIN + 证书通道 + 去 noindex）。
# ============================================================================
set -uo pipefail

SUB="convation"                       # 子域名前缀
ZONE="geopro.cc"
DOMAIN="${SUB}.${ZONE}"               # convation.geopro.cc
APP_DIR="/var/www/convation"
REPO="https://github.com/yhai3596/convation.git"
BRANCH="main"
PORT=8203
CERT_DIR="/etc/ssl/convation"
SERVER_IP="$(curl -s --max-time 8 ifconfig.me || echo 43.156.58.154)"

log() { echo -e "\n\033[1;33m==> $*\033[0m"; }

# --------------------------------------------------- 0. 端口占用保护
# 8203 若被"非 convation"的服务占用，立即停手，避免撞现有站
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT} " && ! systemctl is-active --quiet convation; then
  echo "[ERROR] 端口 ${PORT} 已被其他服务占用，请换端口或先排查："
  ss -ltnp | grep ":${PORT} " || true
  exit 1
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
# 可选增强（填好后 systemctl restart convation 生效）：
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
log "6/8 配置 systemd 服务 convation.service"
cat > /etc/systemd/system/convation.service <<EOF
[Unit]
Description=Convation site (HVAC vendita/installazione/assistenza · IT/EN)
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
systemctl enable --now convation
sleep 2
systemctl restart convation
sleep 2
if curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" | grep -q 200; then
  echo "应用已监听 127.0.0.1:${PORT}"
else
  echo "[ERROR] 应用未正常启动：journalctl -u convation -n 50"; journalctl -u convation -n 30 --no-pager; exit 1
fi

# --------------------------------------------------- 7. 证书 + nginx（只管本子域）
log "7/8 签发证书（${DOMAIN}）并配置 nginx"
mkdir -p "${CERT_DIR}"
HAS_CERT=0
if [ -s "${CERT_DIR}/convation.cer" ] && openssl x509 -in "${CERT_DIR}/convation.cer" -noout -text 2>/dev/null | grep -q "DNS:${DOMAIN}"; then
  HAS_CERT=1; echo "证书已存在"
else
  ~/.acme.sh/acme.sh --issue --dns dns_gd -d "${DOMAIN}" --server letsencrypt --force && \
  ~/.acme.sh/acme.sh --install-cert -d "${DOMAIN}" \
    --fullchain-file "${CERT_DIR}/convation.cer" \
    --key-file "${CERT_DIR}/convation.key" \
    --reloadcmd "nginx -s reload" && HAS_CERT=1
  [ "$HAS_CERT" = "1" ] || echo "[WARN] 证书签发失败，先以 HTTP 提供服务；稍后重跑本脚本重试"
fi

# 预览域整站 noindex：不被搜索引擎收录，避免与未来正式域 www.convation.it 抢排名
if [ "$HAS_CERT" = "1" ]; then
  cat > /etc/nginx/conf.d/convation.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://${DOMAIN}\$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};
    ssl_certificate ${CERT_DIR}/convation.cer;
    ssl_certificate_key ${CERT_DIR}/convation.key;
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
  cat > /etc/nginx/conf.d/convation.conf <<EOF
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
install -m 0755 "${APP_DIR}/deploy/autopull-convation.sh" /usr/local/bin/convation-autopull.sh
cat > /etc/systemd/system/convation-autopull.service <<EOF
[Unit]
Description=Convation auto git pull

[Service]
Type=oneshot
ExecStart=/usr/local/bin/convation-autopull.sh
EOF
cat > /etc/systemd/system/convation-autopull.timer <<EOF
[Unit]
Description=Run convation-autopull every minute

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=false

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now convation-autopull.timer

# --------------------------------------------------- 完成
log "部署完成"
echo "站点：$([ "$HAS_CERT" = "1" ] && echo https || echo http)://${DOMAIN}"
echo "服务：systemctl status convation | 日志：journalctl -u convation -f"
echo "自动更新：本地 git push 后 1 分钟内生效（日志 /var/log/convation-autopull.log）"
if [ -f "${APP_DIR}/data/admin-credentials.txt" ]; then
  echo; echo "★ 管理员初始账号（请登录后妥善保存）："
  cat "${APP_DIR}/data/admin-credentials.txt"
fi
