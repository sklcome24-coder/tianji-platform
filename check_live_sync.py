#!/usr/bin/env python3
"""線上落後偵測——確認 GitHub Pages 上跑的就是本機這一份。

為什麼要有（2026-09-10 立，三件事同一天冒出來）：
  · 紫微「大限對應公元年由程式算」2026-09-06 就修好了，**只在本機、從未提交**，
    線上免費版整整四天還在讓模型自己換算歲數（曾算差十一年）。
  · Pages 上躺著一支 2026-09-01 的舊 xuankong.html，沒有五黃順逆修正
    （替卦 216 盤中 14 張排錯，含光明頂），公開可達卻沒人發現。
  · 免費版漏掉 2026-08-28 的 429 修正，上架版早就有。

**共通點都是「改好了，但線上沒有」。** 修得對不對是一回事，有沒有送到人手上是另一回事。
這支只回答後者：**線上那一份，位元組是不是等於本機這一份。**

用法：
    python3 check_live_sync.py            # 檢查，落後就 exit 1
    python3 check_live_sync.py --quiet    # 只在有問題時輸出（給 cron 用）
"""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import subprocess
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
BASE = "https://sklcome24-coder.github.io/tianji-platform"

# 會部署出去、且有人會直接打開的頁。左為檔名，右為（原始檔, 重建指令）——
# 沒有原始檔的是手寫靜態頁，不必重建。
PAGES = {
    "index.html":    None,
    "ziwei.html":    ("ziwei.src.html", "python3 build_ziwei_app.py"),
    "jingfang.html": None,
    "xuankong.html": None,
    "liuyao.html":   None,
    "backend.json":  None,
}

PROBLEMS: list[str] = []


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch(name: str, timeout: int = 40) -> bytes | None:
    # CDN 是 max-age=600，不破快取會拿到十分鐘前的舊檔而誤判成同步。
    url = f"{BASE}/{name}?bust={int(time.time())}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read()
    except Exception as e:                                   # noqa: BLE001
        PROBLEMS.append(f"{name}：抓不到線上檔（{type(e).__name__}）")
        return None


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=HERE, capture_output=True,
                          text=True).stdout.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true", help="只在有問題時輸出（cron 用）")
    a = ap.parse_args()
    say = (lambda *x: None) if a.quiet else print

    say("【一】產物是否落後原始檔（該重建卻沒重建）")
    for name, src in PAGES.items():
        if not src:
            continue
        s, cmd = src
        sp, op = HERE / s, HERE / name
        stale = sp.stat().st_mtime > op.stat().st_mtime
        say(f"  {'✘' if stale else '✔'} {name} ← {s}"
            + (f"　原始檔較新，請先跑：{cmd}" if stale else ""))
        if stale:
            PROBLEMS.append(f"{name} 未重建（{s} 較新，請跑 {cmd}）")

    say("\n【二】本機是否有未提交／未推的可部署檔")
    dirty = [l for l in git("status", "--porcelain").splitlines()
             if l[3:].strip().strip('"') in PAGES]
    say("  ✔ 無未提交的可部署檔" if not dirty else "  ✘ 未提交：" + "、".join(l[3:] for l in dirty))
    PROBLEMS.extend(f"{l[3:]} 未提交" for l in dirty)
    ahead = git("rev-list", "--count", "@{u}..HEAD") or "0"
    say(f"  {'✔ 沒有未推的 commit' if ahead == '0' else f'✘ 有 {ahead} 個 commit 未推'}")
    if ahead != "0":
        PROBLEMS.append(f"{ahead} 個 commit 未推")

    say("\n【三】線上 ↔ 本機 逐檔比對（破 CDN 快取）")
    for name in PAGES:
        p = HERE / name
        if not p.exists():
            PROBLEMS.append(f"{name} 本機不存在")
            say(f"  ✘ {name}　本機不存在")
            continue
        live = fetch(name)
        if live is None:
            say(f"  ✘ {name}　抓不到線上檔")
            continue
        mine = p.read_bytes()
        same = sha(live) == sha(mine)
        say(f"  {'✔' if same else '✘'} {name}　線上 {len(live):,} B ／ 本機 {len(mine):,} B"
            + ("" if same else "　← 線上落後，請跑 ./deploy.sh"))
        if not same:
            PROBLEMS.append(f"{name} 線上與本機不同（線上 {len(live):,} B／本機 {len(mine):,} B）")

    if PROBLEMS:
        print(f"\n✘ 線上未同步，共 {len(PROBLEMS)} 項：")
        for x in PROBLEMS:
            print("  · " + x)
        print("\n  修法：./deploy.sh \"這次改了什麼\"")
        sys.exit(1)
    say("\n✓ 線上與本機完全一致")


if __name__ == "__main__":
    main()
