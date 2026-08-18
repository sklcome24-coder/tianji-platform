#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""引文覆核——每個出處編號都必須在引文中有實際對應的文字。

為什麼要有這支：規矩擋不住的，交給程式擋。「查索引→讀原文」寫在流程裡沒有用，
因為憑記憶引古文的人不會覺得自己在憑記憶。玄空那邊就發生過：同一句賦文
被掛上兩個編號，其中一個編號的原文一個字都沒被引到，而且四處都這樣寫。

檢查兩件事：
  一、掛出去的編號在 紫微賦文.md 裡存在嗎（打錯字、記錯號）
  二、引號裡的文字，真的出自所掛的那個編號嗎（張冠李戴、多號共用一段引文）

第二項是重點。單引一號時查它對不對；並列多號時，**每一個號都要分到自己的文字**，
分不到的就是掛錯。要引兩條就各引各的。

比對用最長共同子字串而非全等：引文常只截取原句一段，且古籍異體字零星難免
（羣/群、裏/裡），全等比對會把正確引用誤判為錯。預設要求 4 字連續相符。

用法：
    python3 check_citations.py                 # 覆核本專案所有 md 與 js
    python3 check_citations.py 某份稿.md        # 覆核指定檔案
    python3 check_citations.py --min-run 5     # 調嚴
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys
import unicodedata

HERE = pathlib.Path(__file__).resolve().parent
CANON = HERE / "紫微賦文.md"

# 篇前綴：微性垣繩發彀增問髓女等得陷富貧局
CODE = r"[微性垣繩發彀增問髓女等得陷富貧局]-\d+"
QUOTED = re.compile(
    r"「([^「」]{4,})」\s*[（(]\s*(" + CODE + r"(?:\s*[、,，]\s*" + CODE + r")*)\s*[）)]")
CODE_RE = re.compile(CODE)


def load_canon() -> dict[str, str]:
    if not CANON.exists():
        sys.exit(f"找不到底本 {CANON}，請先跑 number_canon.py")
    out: dict[str, str] = {}
    for m in re.finditer(r"^- (" + CODE + r")\s*(.+)$", CANON.read_text(encoding="utf-8"), re.M):
        out[m.group(1)] = m.group(2).strip()
    return out


def norm(s: str) -> str:
    """正規化：去標點空白、全形轉半形。比對的是字，不是排版。"""
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s，。；：、！？「」『』（）()《》〈〉·．,.;:!?—\-]", "", s)


def longest_common(a: str, b: str) -> int:
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    best = 0
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best = cur[j]
        prev = cur
    return best


def check_text(text: str, canon: dict[str, str], where: str, min_run: int) -> list[str]:
    problems: list[str] = []

    for code in sorted(set(CODE_RE.findall(text))):
        if code not in canon:
            problems.append(f"{where}　{code} 不存在於紫微賦文.md")

    for m in QUOTED.finditer(text):
        quote, codes_s = m.group(1), m.group(2)
        codes = CODE_RE.findall(codes_s)
        nq = norm(quote)
        hits = {c: longest_common(nq, norm(canon[c])) for c in codes if c in canon}
        if not hits:
            continue
        if not any(n >= min_run for n in hits.values()):
            problems.append(
                f'{where}　引文「{quote[:24]}…」掛（{"、".join(codes)}），'
                f"但沒有任何一號對得上原文")
            continue
        for c in codes:
            if c in hits and hits[c] < min_run:
                problems.append(
                    f'{where}　引文「{quote[:24]}…」掛了 {c}，'
                    f"但 {c} 的原文未被引到（僅 {hits[c]} 字重合）"
                    f"　→ 該號原文：{canon[c][:34]}…")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="引文覆核：每個編號都要對得上原文")
    ap.add_argument("target", nargs="?", help="要覆核的檔案；省略則掃全專案")
    ap.add_argument("--min-run", type=int, default=4)
    a = ap.parse_args()

    canon = load_canon()
    problems: list[str] = []

    if a.target:
        p = pathlib.Path(a.target)
        problems += check_text(p.read_text(encoding="utf-8"), canon, p.name, a.min_run)
    else:
        root = HERE.parent
        for p in sorted(list(root.rglob("*.md")) + list(root.rglob("*.js"))):
            if any(x in p.parts for x in ("node_modules", ".git", "紫微斗數全書")):
                continue
            if p.name in ("紫微賦文.md",):
                continue
            problems += check_text(p.read_text(encoding="utf-8", errors="ignore"),
                                   canon, str(p.relative_to(root)), a.min_run)

    print(f"底本條目 {len(canon)} 條")
    if not problems:
        print("引文覆核：全部對得上 ✔")
        return 0
    print(f"引文覆核：{len(problems)} 項不合\n")
    for msg in problems:
        print(f"  [錯] {msg}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
