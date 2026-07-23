#!/usr/bin/env bash
# convation-autopull：每分钟由 systemd timer 触发。拉取 GitHub 仓库，
# 代码有变更则（按需 npm ci 后）重启 convation 服务；无变更零动作。
# 注意：运行副本在 /usr/local/bin/convation-autopull.sh，不随 pull 自动更新；
# 修改后需重新 install -m 0755 /var/www/convation/deploy/autopull-convation.sh /usr/local/bin/convation-autopull.sh
set -u
LOG=/var/log/convation-autopull.log
APP=/var/www/convation

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

systemctl restart convation
echo "[UPD] $(date '+%F %T') ${OLD:0:8} -> ${NEW:0:8} restarted" >>"$LOG"
