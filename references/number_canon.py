#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把《紫微斗數全書》卷一逐句編號，產出可引用的底本 紫微賦文.md。

為什麼要編號：斷語必須掛得出出處，而出處要能被**機械覆核**——引文的每一個編號
都得在底本裡找得到對應文字。沒有編號就只能靠記憶引用，而憑記憶引古文必然出錯
（玄空踩過：「雞交鼠」誤作「難交鼠」，整句就失去星曜依據）。

編號規則：`<篇>-<序>`，序號在該篇內從 01 起連續。篇的前綴為單字，取自篇名：

    微 太微賦        性 形性賦        垣 星垣論        繩 斗數準繩
    發 斗數發微論    彀 重補斗數彀率  增 增補太微賦    問 諸星問答論
    髓 斗數骨髓賦    女 女命骨髓賦    等 定富貴貧賤十等論
    得 十二宮諸星得地合格訣          陷 十二宮諸星失陷破格訣
    富 十二宮諸星得地富貴論          貧 十二宮諸星失陷貧賤論
    局 定富局／定貴局／定貧賤局／定雜局（四篇連續編號）

斷句：韻文以行為單位（原文 <poem> 每行本就是一句或一聯），
散文則以句號切分。**不重排、不改字**——這支只加編號，不動文字，
文字的取捨已在 build_ziwei_canon.py 的校勘表處理過。

用法：
    python3 number_canon.py            # 產出 紫微賦文.md
    python3 number_canon.py --stats    # 只印統計
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "紫微斗數全書" / "卷一.md"
OUT = HERE / "紫微賦文.md"

PREFIX = {
    "太微賦": "微", "形性賦": "性", "星垣論": "垣", "斗數準繩": "繩",
    "斗數發微論": "發", "重補斗數彀率": "彀", "增補太微賦": "增",
    "諸星問答論": "問", "斗數骨髓賦": "髓", "女命骨髓賦": "女",
    "定富貴貧賤十等論": "等",
    "十二宮諸星得地合格訣": "得", "十二宮諸星失陷破格訣": "陷",
    "十二宮諸星得地富貴論": "富", "十二宮諸星失陷貧賤論": "貧",
    "定富局": "局", "定貴局": "局", "定貧賤局": "局", "定雜局": "局",
}
SKIP = {"羅序"}          # 序不含斷語，不編號


def sections(text: str):
    lines = text.split("\n")
    marks = [(i, l.strip("= ").strip()) for i, l in enumerate(lines)
             if re.match(r"^===[^=]", l)]
    marks.append((len(lines), None))
    for (i, name), (j, _) in zip(marks[:-1], marks[1:]):
        yield name, "\n".join(lines[i + 1:j])


def split_units(body: str):
    """切成可引用的單位。韻文以行為單位，長行再依句號切。"""
    body = re.sub(r"</?poem>", "", body)
    out = []
    for raw in body.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("===="):          # 諸星問答論的小標題
            out.append(("題", line.strip("= ").strip()))
            continue
        if len(line) <= 40:
            out.append(("句", line))
        else:                                 # 散文長行：依句號切
            for s in re.split(r"(?<=[。！？])", line):
                s = s.strip()
                if s:
                    out.append(("句", s))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="紫微賦文逐句編號")
    ap.add_argument("--stats", action="store_true", help="只印統計不寫檔")
    a = ap.parse_args()

    if not SRC.exists():
        sys.exit(f"找不到 {SRC}，請先跑 build_ziwei_canon.py")

    text = SRC.read_text(encoding="utf-8")
    md = ["# 紫微斗數全書 · 卷一賦文（逐句編號）",
          "",
          "> 底本：維基文庫 zh.wikisource.org《紫微斗數全書》，清代刊本，公有領域。",
          "> 正體化與術語校勘見 `build_ziwei_canon.py`；本檔只加編號，不改文字。",
          "> **引用時務必回本檔讀完整句，不要憑編號回憶內容。**",
          ""]
    counter: dict[str, int] = {}
    total = 0
    stats = []

    for name, body in sections(text):
        if name in SKIP or name not in PREFIX:
            continue
        pre = PREFIX[name]
        md.append(f"\n## {name}\n")
        n0 = counter.get(pre, 0)
        for kind, s in split_units(body):
            if kind == "題":
                md.append(f"\n### {s}\n")
                continue
            counter[pre] = counter.get(pre, 0) + 1
            md.append(f"- {pre}-{counter[pre]:02d}　{s}")
            total += 1
        stats.append((name, pre, counter.get(pre, 0) - n0))

    print("紫微賦文編號")
    print("=" * 50)
    print(f"{'篇章':<22}{'前綴':>4}{'條數':>6}")
    for name, pre, n in stats:
        print(f"{name:<22}{pre:>4}{n:>6}")
    print("-" * 50)
    print(f"{'合計':<22}{'':>4}{total:>6} 條")

    if a.stats:
        print("\n（--stats 模式，未寫檔）")
        return 0

    OUT.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"\n已寫入 {OUT}（{len(''.join(md)):,} 字）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
