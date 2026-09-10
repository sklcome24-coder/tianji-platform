#!/bin/bash
# 定時偵測：天紀平台線上是否落後本機。由 launchd 每 30 分鐘叫一次。
#
# 為什麼要定時（2026-09-10 立）：deploy.sh 與 audit 都只在「有人動手」時才會擋。
# 而實際發生的事故正好是**沒人動手**——紫微的修正在本機躺了四天，
# 沒有人跑稽核、也沒有人部署，於是四天沒人知道線上是舊的。
#
# 只在真的落後時吵你；抓不到線上檔（沒網路、Pages 暫時不通）視為無法判定，
# 記進 log 但不通知——會亂叫的監測，很快就會被忽略，等於沒有。
cd "$(dirname "$0")" || exit 0
LOG="$HOME/Library/Logs/tianji-live-sync.log"
mkdir -p "$(dirname "$LOG")"
OUT=$(python3 check_live_sync.py 2>&1)
RC=$?
TS=$(date "+%Y-%m-%d %H:%M:%S")

if [ $RC -eq 0 ]; then
  echo "$TS  ✔ 同步" >> "$LOG"
  exit 0
fi

if echo "$OUT" | grep -q "抓不到線上檔"; then
  echo "$TS  － 無法判定（連不上）" >> "$LOG"
  exit 0
fi

echo "$TS  ✘ 線上落後" >> "$LOG"
echo "$OUT" | sed 's/^/    /' >> "$LOG"
N=$(echo "$OUT" | grep -c "^  · ")
osascript -e "display notification \"有 ${N} 項線上落後本機，請跑 ./deploy.sh\" with title \"天紀平台未同步\" sound name \"Basso\"" >/dev/null 2>&1
exit 1
