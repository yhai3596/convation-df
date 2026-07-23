#!/usr/bin/env bash
# convation-df-autopull：每分钟由 systemd timer 触发。拉取 GitHub 仓库，
# 代码有变更则（按需 npm ci 后）重启 convation-df 服务；无变更零动作。
# ⚠ 只操作预览版资源（/var/www/convation-df、convation-df.service），
#   与线上对照组 convation（/var/www/convation、convation.service）完全隔离。
# 注意：运行副本在 /usr/local/bin/convation-df-autopull.sh，不随 pull 自动更新；
# 修改后需重新 install -m 0755 /var/www/convation-df/deploy/autopull-convation.sh /usr/local/bin/convation-df-autopull.sh
set -u
LOG=/var/log/convation-df-autopull.log
APP=/var/www/convation-df

cd "$APP" || exit 0
OLD=$(git rev-parse HEAD 2>/dev/null || echo none)
if ! git pull -q --ff-only >>"$LOG" 2>&1; then
  echo "[WARN] $(date '+%F %T') git pull failed" >>"$LOG"
  exit 0
fi
NEW=$(git rev-parse HEAD 2>/dev/null || echo none)
[ "$OLD" = "$NEW" ] && exit 0

if ! git diff --quiet "$OLD" "$NEW" -- package.json package-lock.json 2>/dev/null; then
  echo "[UPD] $(date '+%F %T') deps changed, npm ci..." >>"$LOG"
  npm ci --no-audit --no-fund >>"$LOG" 2>&1 || echo "[WARN] $(date '+%F %T') npm ci failed" >>"$LOG"
fi

systemctl restart convation-df
echo "[UPD] $(date '+%F %T') ${OLD:0:8} -> ${NEW:0:8} restarted" >>"$LOG"
