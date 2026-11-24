#!/usr/bin/env python3
"""引数の各ディレクトリを「ディレクトリ名/…」を含む個別の ZIP にする（Windows でも文字化けしない）。

- 非 ASCII の名前には UTF-8 フラグ（bit 11）が付く（Python の zipfile の仕様）
- 格納名を NFC に正規化する（macOS の NFD による濁点の分離を直す）
- .DS_Store / ._* / __MACOSX などは入れない。除外した結果、中身が無くなったフォルダは空フォルダとして残す
- シンボリックリンク（ファイルもフォルダも）は入れない
- 書き出しは一時ファイル（.<name>.zip.part）に行い、成功したときだけ <name>.zip に置き換える。
  途中で失敗しても壊れた ZIP は残らない
"""

import os
import sys
import unicodedata
import zipfile
from pathlib import Path

SKIP_FILES = {'.DS_Store', '.localized', 'Thumbs.db', 'desktop.ini', 'Icon\r'}
SKIP_DIRS = {'__MACOSX', '.git', '.Trashes', '.Spotlight-V100', '.fseventsd'}


def nfc(s: str) -> str:
    return unicodedata.normalize('NFC', s)


def zip_dir(src: Path) -> None:
    src = src.resolve()
    out = src.with_name(nfc(src.name) + '.zip')
    if out.exists():
        print(f'スキップ（既存）: {out}')
        return
    tmp = out.with_name(f'.{out.name}.part')
    try:
        # strict_timestamps=False: 1980 年より前の更新日時のファイルも、1980-01-01 として格納する
        with zipfile.ZipFile(
            tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False
        ) as z:
            for root, dirs, files in os.walk(src):
                dirs[:] = sorted(
                    d for d in dirs if d not in SKIP_DIRS and not Path(root, d).is_symlink()
                )
                rel_root = Path(root).relative_to(src.parent)
                kept = [
                    f
                    for f in sorted(files)
                    if f not in SKIP_FILES
                    and not f.startswith('._')
                    and not Path(root, f).is_symlink()
                ]
                # 除外した結果、中身が無くなったフォルダも空フォルダとして残す
                if not kept and not dirs:
                    z.writestr(nfc(rel_root.as_posix()) + '/', b'')
                for f in kept:
                    z.write(Path(root, f), nfc((rel_root / f).as_posix()))
        os.replace(tmp, out)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    print(f'作成: {out}')


def main(args: list[str]) -> int:
    if not args:
        print('使い方: winzip.py <ディレクトリ> [<ディレクトリ> ...]', file=sys.stderr)
        return 2
    failed = 0
    for arg in args:
        path = Path(arg)
        if not path.is_dir():
            print(f'エラー: ディレクトリではありません: {arg}', file=sys.stderr)
            failed += 1
            continue
        try:
            zip_dir(path)
        except OSError as e:
            print(f'エラー: {arg}: {e}', file=sys.stderr)
            failed += 1
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
