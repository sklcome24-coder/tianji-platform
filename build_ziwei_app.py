#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 ziwei.src.html 建置成零外連的 ziwei.html。

為什麼要有這支：原本的頁面在載入時要向四個外站取檔——

    unpkg.com/@babel/standalone   ← 沒有它，整頁一行都跑不起來
    esm.sh/react、react-dom       ← React 本體
    esm.sh/lucide-react           ← 67 個圖示
    cdn.tailwindcss.com、fonts.googleapis.com

任何一個掛掉或改版，排盤就整個白畫面。命理工具在人家客廳、在沒訊號的地方也要能開，
這種依賴不能留。

作法與玄空的 build_app.py 同一路：**原始檔留 ESM 寫法便於維護，建置期轉成瀏覽器
直接吃得下的形式**——
  1. JSX 在建置期用本地 Babel 編譯掉，執行期不再需要 Babel（省下 3MB）
  2. ESM import 改寫為讀取全域（React / ReactDOM / LucideIcons）
  3. 外部 <script>、<link> 換成 assets/ 下的本地檔
  4. Google Fonts 移除，退回系統襯線體（純外觀，不影響功能）

assets/ 下的檔案保持獨立不內嵌——這個 app 本來就是整個資料夾部署（GitHub Pages），
內嵌成單檔只會讓每次改動都要重傳 1MB。若日後要做成可存進手機的真單檔版，
再加一個 --single 模式即可。

用法：
    python3 build_ziwei_app.py            # 建置
    python3 build_ziwei_app.py --check    # 只檢查外連殘留
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "ziwei.src.html"
OUT = HERE / "ziwei.html"
ASSETS = HERE / "assets"

EXTERNAL = re.compile(r"https?://(?!127\.0\.0\.1|localhost)[^\s\"'`)]+")
ALLOW_HOSTS = {"www.w3.org"}          # SVG namespace，不是網路請求


def compile_jsx(src_js: str) -> str:
    """用本地 Babel 把 JSX 編譯成純 JS。執行期因此不再需要 Babel。"""
    with tempfile.TemporaryDirectory() as td:
        inp = pathlib.Path(td) / "in.js"
        inp.write_text(src_js, encoding="utf-8")
        script = f"""
        const fs=require('fs');
        const Babel=require({json.dumps(str(ASSETS / 'babel.min.js'))});
        const code=fs.readFileSync({json.dumps(str(inp))},'utf8');
        const out=Babel.transform(code,{{presets:['react'],sourceType:'script'}}).code;
        process.stdout.write(out);
        """
        r = subprocess.run(["node", "-e", script], capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit("Babel 編譯失敗：\n" + r.stderr[:800])
        return r.stdout


def rewrite_imports(js: str) -> str:
    """ESM import → 讀全域。UMD 版本把 React/ReactDOM/圖示掛在 window 上。"""
    # import React, { useState, ... } from '...react...'
    m = re.search(r"import\s+React\s*,\s*\{([^}]+)\}\s*from\s*['\"][^'\"]*react@[^'\"]*['\"]\s*;?", js)
    hooks = m.group(1).strip() if m else "useState, useEffect, useRef"
    js = re.sub(r"import\s+React\s*,\s*\{[^}]+\}\s*from\s*['\"][^'\"]*react@[^'\"]*['\"]\s*;?", "", js)

    # import { createRoot } from '...react-dom/client'
    js = re.sub(r"import\s*\{[^}]*\}\s*from\s*['\"][^'\"]*react-dom[^'\"]*['\"]\s*;?", "", js)

    # import { ...icons } from '...lucide-react...'
    mi = re.search(r"import\s*\{([^}]+)\}\s*from\s*['\"][^'\"]*lucide-react[^'\"]*['\"]\s*;?", js)
    icons = mi.group(1) if mi else ""
    js = re.sub(r"import\s*\{[^}]+\}\s*from\s*['\"][^'\"]*lucide-react[^'\"]*['\"]\s*;?", "", js)

    # import 的 `X as Y` 在解構賦值裡不合法，要改成 `X: Y`——這一步漏掉會編譯失敗
    icon_names, parts = [], []
    for n in icons.split(","):
        n = n.strip()
        if not n:
            continue
        if " as " in n:
            orig, alias = (x.strip() for x in n.split(" as ", 1))
            icon_names.append(orig)
            parts.append(f"{orig}: {alias}")
        else:
            icon_names.append(n)
            parts.append(n)
    icon_decl = ", ".join(parts)

    header = (
        "/* 建置期改寫：原為 ESM import，改讀 UMD 掛載的全域，執行期不需要打包器 */\n"
        "const React = window.React;\n"
        f"const {{ {hooks} }} = React;\n"
        "const { createRoot } = window.ReactDOM;\n"
        + (f"const {{ {icon_decl} }} = window.LucideIcons;\n" if icon_decl else "")
    )
    return header + js, icon_names


def main() -> int:
    ap = argparse.ArgumentParser(description="建置零外連的 ziwei.html")
    ap.add_argument("--check", action="store_true", help="只檢查產物的外連殘留")
    a = ap.parse_args()

    if a.check:
        return check(OUT)

    if not SRC.exists():
        sys.exit(f"找不到 {SRC}")
    html = SRC.read_text(encoding="utf-8")

    # 1. 取出 babel 區塊
    m = re.search(r'<script type="text/babel"[^>]*>([\s\S]*?)</script>', html)
    if not m:
        sys.exit("找不到 <script type=\"text/babel\"> 區塊")
    body, icon_names = rewrite_imports(m.group(1))
    compiled = compile_jsx(body)
    print(f"  JSX 編譯：{len(m.group(1)):,} → {len(compiled):,} 字元")
    print(f"  圖示：{len(icon_names)} 個改讀本地 assets/icons.js")

    html = html[:m.start()] + '<script>\n' + compiled + '\n</script>' + html[m.end():]

    # 2. 外部資源換本地
    subs = [
        (r'<script src="https://cdn\.tailwindcss\.com"></script>',
         '<script src="assets/saved_resource.js"></script><!-- Tailwind 瀏覽器版，本地 -->'),
        (r'<script src="https://unpkg\.com/@babel/standalone/babel\.min\.js"></script>',
         '<script src="assets/react.js"></script>\n'
         '    <script src="assets/react-dom.js"></script>\n'
         '    <script src="assets/icons.js"></script><!-- Babel 已於建置期用掉，執行期不需要 -->'),
        (r'<link href="https://fonts\.googleapis\.com[^>]*>', ''),
    ]
    for pat, rep in subs:
        html, n = re.subn(pat, rep, html)
        if n == 0:
            print(f"  ⚠ 未命中：{pat[:52]}")

    # 3. lunar 的 CDN 備援拿掉——本地已有 assets/lunar.js
    html = re.sub(r"cdn\.src\s*=\s*'https://cdn\.jsdelivr\.net[^']*';",
                  "cdn.src = 'assets/lunar.js'; /* 無 CDN 備援：離線優先 */", html)

    OUT.write_text(html, encoding="utf-8")
    print(f"\n已寫入 {OUT}（{len(html):,} 字元）")
    return check(OUT)


def check(path: pathlib.Path) -> int:
    html = path.read_text(encoding="utf-8")
    hits = [u for u in EXTERNAL.findall(html)
            if not any(h in u for h in ALLOW_HOSTS)]
    print("\n外連檢查")
    print("-" * 46)
    if not hits:
        print("  零外連 ✔")
        return 0
    from collections import Counter
    for host, n in Counter(re.sub(r"https?://([^/]+).*", r"\1", u) for u in hits).most_common():
        print(f"  ✘ {host} ×{n}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
