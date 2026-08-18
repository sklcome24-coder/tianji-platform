#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《紫微斗數全書》正體化與校勘——把維基文庫的正簡混排本整成可引用的底本。

為什麼要有這支：維基文庫那三卷是兩個來源拼起來的，前段正體、後段簡體
（骨髓賦本文就是簡體）。引文比對是逐字的，底本字體不統一，
模型引「太極星纏」而底本作「太极星缠」就對不上，覆核形同虛設。

但**不能盲轉**。OpenCC 三個模式（s2t / s2tw / s2twp）在這份文本上都會造成：

    丑→醜 ×129      地支丑，變成醜陋
    斗→鬥 ×86       斗數，變成鬥數
    凶→兇 ×210      吉凶，變成兇猛
    冲→衝 ×66       沖剋，變成衝撞
    干→幹 ×6        天干，變成幹事

這五組在命理文本裡幾乎全錯。故本支的作法是：**先轉，再依術語保護表回改，
並把每一處回改都記錄下來供人覆核**——這張表就是校勘表，不是黑箱。

保護表採「預設回改 + 例外白名單」：例如「醜」一律回改為「丑」，
但「形醜貌粗」「醜貌」這類確實是醜陋之義者列入白名單不動。

用法：
    python3 build_ziwei_canon.py --src /tmp            # 產出底本與校勘表
    python3 build_ziwei_canon.py --src /tmp --report   # 只印報告不寫檔
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys
from collections import Counter

try:
    import opencc
except ImportError:
    sys.exit("需要 opencc：pip3 install opencc-python-reimplemented")

HERE = pathlib.Path(__file__).resolve().parent

# 轉換後須回改的命理術語。key 為 OpenCC 轉出的字，value 為 (正字, 例外詞白名單)
# 白名單裡的詞保留 OpenCC 的轉換結果——那些是真正的本義用法。
PROTECT = {
    "醜": ("丑", ["形醜", "醜貌", "醜陋"]),
    "鬥": ("斗", ["爭鬥", "鬥爭", "打鬥"]),
    "兇": ("凶", []),                      # 命理之凶一律作凶
    "衝": ("沖", []),                      # 命理之沖剋一律作沖
    "幹": ("干", ["所幹", "幹事", "幹無成", "才幹"]),
}

# 異體統一。原文本身正簡混排，轉換後同一個字出現兩種寫法（爲363／為207、
# 衆21／眾6），逐字比對會因此對不上。一律取台灣通行寫法。
# 這一層不涉字義，純為統一字形，但仍計入校勘表以求透明。
VARIANTS = {"爲": "為", "衆": "眾"}


def load(src: pathlib.Path) -> dict[str, str]:
    out = {}
    for p in sorted(src.glob("zw_juan*.txt")):
        out[p.name] = p.read_text(encoding="utf-8")
    if not out:
        sys.exit(f"在 {src} 找不到 zw_juan*.txt")
    return out


def restore(text: str) -> tuple[str, Counter, list[tuple[str, str]]]:
    """回改術語，回傳 (結果, 回改計數, 白名單命中處)"""
    counts, kept = Counter(), []
    for bad, (good, allow) in PROTECT.items():
        pos = 0
        buf = []
        for m in re.finditer(re.escape(bad), text):
            i = m.start()
            ctx = text[max(0, i - 2): i + 3]
            if any(w in ctx for w in allow):
                kept.append((bad, ctx))
                continue
            buf.append(i)
        for i in reversed(buf):
            text = text[:i] + good + text[i + 1:]
            counts[f"{bad}→{good}"] += 1
    for bad, good in VARIANTS.items():
        n = text.count(bad)
        if n:
            text = text.replace(bad, good)
            counts[f"{bad}→{good}（異體統一）"] += n
    return text, counts, kept


def main() -> int:
    ap = argparse.ArgumentParser(description="紫微斗數全書正體化與校勘")
    ap.add_argument("--src", default="/tmp", help="維基文庫 raw 檔所在目錄")
    ap.add_argument("--report", action="store_true", help="只印報告不寫檔")
    a = ap.parse_args()

    cc = opencc.OpenCC("s2t")
    raws = load(pathlib.Path(a.src))

    total_conv = Counter()
    total_restore = Counter()
    all_kept: list[tuple[str, str]] = []
    outputs: dict[str, str] = {}

    for name, raw in raws.items():
        conv = cc.convert(raw)
        if len(conv) == len(raw):
            for x, y in zip(raw, conv):
                if x != y:
                    total_conv[f"{x}→{y}"] += 1
        fixed, rc, kept = restore(conv)
        total_restore.update(rc)
        all_kept += kept
        outputs[name] = fixed

    print("《紫微斗數全書》底本整理")
    print("=" * 58)
    print(f"來源：維基文庫 zh.wikisource.org（清代刊本，公有領域）")
    print(f"卷數：{len(raws)}　總字數：{sum(len(v) for v in outputs.values()):,}")

    print(f"\n【一】簡→正 轉換：{sum(total_conv.values()):,} 處／{len(total_conv)} 種")
    for k, n in total_conv.most_common(12):
        print(f"    {k} ×{n}", end="")
    print()

    print(f"\n【二】術語回改（校勘表）：{sum(total_restore.values()):,} 處")
    print("    這些是 OpenCC 轉錯、本支改回的。每一項都須人工覆核：")
    for k, n in total_restore.most_common():
        print(f"      {k} ×{n}")

    print(f"\n【三】白名單保留：{len(all_kept)} 處（判定為本義，未回改）")
    for ch, ctx in all_kept[:12]:
        print(f"      {ch}　…{ctx}…")

    if a.report:
        print("\n（--report 模式，未寫檔）")
        return 0

    outdir = HERE / "紫微斗數全書"
    outdir.mkdir(parents=True, exist_ok=True)
    for name, text in outputs.items():
        (outdir / name.replace("zw_juan", "卷").replace(".txt", ".md")).write_text(
            text, encoding="utf-8")
    print(f"\n已寫入 {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
