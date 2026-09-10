#!/bin/bash
# 一次做完的部署：重建 → 提交 → 推送 → 等 Pages → 驗線上 == 本機。
#
# 為什麼要寫成一支（2026-09-10 立）：
# 「改好了但線上沒有」在這個站發生過三次——紫微大限公元年修正躺在本機四天沒提交、
# Pages 上留著一支會排錯盤的舊 xuankong.html、免費版漏掉 429 修正。
# 每一次都不是修錯，是**送到一半就以為送完了**。
# 這支把「重建、提交、推送、等部署、驗線上」綁成一個動作：
# **驗不過就不算成功**，不會出現「push 成功了所以應該好了」這種話。
#
# 用法：./deploy.sh "這次改了什麼"
set -uo pipefail
cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then echo "用法：./deploy.sh \"這次改了什麼\""; exit 2; fi

echo "【1/5】需要重建的產物"
if [ ziwei.src.html -nt ziwei.html ]; then
  echo "  ziwei.src.html 較新 → 重建 ziwei.html"
  python3 build_ziwei_app.py >/dev/null || { echo "  ✘ 建置失敗"; exit 1; }
  echo "  ✔ 已重建"
else
  echo "  ✔ 無需重建"
fi

echo "【2/5】提交"
git add -A
if git diff --cached --quiet; then
  echo "  ✔ 沒有新變更，跳過提交"
else
  git commit -q -m "$MSG

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && echo "  ✔ $(git log --oneline -1)"
fi

echo "【3/5】推送"
git push -q origin main && echo "  ✔ 已推送" || { echo "  ✘ 推送失敗"; exit 1; }

echo "【4/5】等 Pages 部署（最多 5 分鐘）"
# push 不保證觸發 workflow——2026-08-26／08-27 兩次推完完全沒有 run。
# 故等一段時間仍落後就自己 dispatch，不是乾等。
for i in $(seq 1 30); do
  if python3 check_live_sync.py --quiet >/dev/null 2>&1; then echo "  ✔ 已上線（約 $((i*10)) 秒）"; break; fi
  if [ "$i" = "12" ] && command -v gh >/dev/null; then
    echo "  ⚠ 兩分鐘仍落後，手動觸發 workflow"
    gh workflow run 306537841 --ref main 2>/dev/null && echo "  已 dispatch"
  fi
  sleep 10
done

echo "【5/5】驗線上 == 本機"
if python3 check_live_sync.py; then
  echo
  echo "══ 部署完成，線上就是本機這一份 ══"
else
  echo
  echo "══ ✘ 線上仍未同步——不要說已經更新了 ══"
  exit 1
fi
