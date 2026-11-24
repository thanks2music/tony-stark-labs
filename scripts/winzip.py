#!/usr/bin/env python3
# winzip.py : 引数の各ディレクトリを「ディレクトリ名/…」を含む個別ZIPにする
# - 非ASCII名に UTF-8 フラグ(bit 11)を自動付与（Python zipfile の仕様）
# - 格納名を NFC に正規化（濁点分離対策）
# - .DS_Store / ._* / __MACOSX などを除外
import os, sys, unicodedata, zipfile
from pathlib import Path

SKIP_FILES = {'.DS_Store', '.localized', 'Thumbs.db', 'desktop.ini', 'Icon\r'}
SKIP_DIRS = {'__MACOSX', '.git', '.Trashes', '.Spotlight-V100', '.fseventsd'}

def nfc(s):
    return unicodedata.normalize('NFC', s)

def zip_dir(src: Path):
    src = src.resolve()
    out = src.with_name(nfc(src.name) + '.zip')
    if out.exists():
        print(f'スキップ（既存）: {out}')
        return
    with zipfile.ZipFile(out, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, dirs, files in os.walk(src):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            rel_root = Path(root).relative_to(src.parent)
            if not files and not dirs:          # 空フォルダも保持
                z.writestr(nfc(rel_root.as_posix()) + '/', b'')
            for f in sorted(files):
                if f in SKIP_FILES or f.startswith('._'):
                    continue
                p = Path(root, f)
                if p.is_symlink():
                    continue
                z.write(p, nfc((rel_root / f).as_posix()))
    print(f'作成: {out}')

for arg in sys.argv[1:]:
    if Path(arg).is_dir():
        zip_dir(Path(arg))
