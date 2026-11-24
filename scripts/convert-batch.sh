#!/usr/bin/env bash
#
# convert-batch.sh — 重い FFmpeg 変換を 1 本ずつ「順番に」実行するバッチ
#
# 使い方:
#   ./convert-batch.sh <変換元.mp4> [追加ファイル ...]
#
# 例（フルパス・スペース込みでも OK。必ずクォートで囲む）:
#   ./convert-batch.sh "/Volumes/.../2026-06-04-NBA.mp4" "/Volumes/.../2026-06-05.mp4"
#   ./convert-batch.sh /path/to/*.mp4
#
# 各入力につき OUTDIR に以下 2 本を生成する:
#   ① 1080p / H265            …(1080p_H265).mp4
#   ② 720p  / H265（モバイル用） …(720p_H265).mp4
#
# 同時実行はしない（& を付けないため、1 本終わるまで次を開始しない＝順次実行）。
#
set -uo pipefail

# ── 出力先（年度が変わったらこの 1 行だけ変更する） ──────────────────────
OUTDIR='/Volumes/KeepTheFaith18TB/01. Video/01. NBA/2025-2026-Season'

# ── 事前チェック ─────────────────────────────────────────────────────
if [ "$#" -eq 0 ]; then
  echo "使い方: $0 <変換元.mp4> [追加ファイル ...]" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "エラー: ffmpeg が見つかりません。'brew install ffmpeg' を実行してください。" >&2
  exit 1
fi

if [ ! -d "$OUTDIR" ]; then
  echo "エラー: 出力先が見つかりません: $OUTDIR" >&2
  echo "       外付けボリュームがマウントされているか確認してください。" >&2
  exit 1
fi

# ── 変換ループ ───────────────────────────────────────────────────────
total="$#"
i=0
missing=0

for f in "$@"; do
  i=$((i + 1))

  if [ ! -f "$f" ]; then
    echo "[$i/$total] 警告: '$f' が見つかりません。スキップします。" >&2
    missing=$((missing + 1))
    continue
  fi

  name="$(basename "${f%.*}")"                    # ディレクトリと拡張子を除いたファイル名
  out1080="${OUTDIR}/${name}(1080p_H265).mp4"
  out720="${OUTDIR}/${name}(720p_H265).mp4"

  echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 開始 ====="

  # ① 1080p / H265
  if [ -f "$out1080" ]; then
    echo "  → 1080p は既に存在するためスキップ: $out1080"
  else
    nice -n 10 ffmpeg -nostdin -i "$f" -vcodec libx265 -b:v 3000k \
      -acodec aac -b:a 128k -vf "scale=-1:1080" "$out1080"
  fi

  # ② 720p / モバイル用
  if [ -f "$out720" ]; then
    echo "  → 720p は既に存在するためスキップ: $out720"
  else
    nice -n 10 ffmpeg -nostdin -i "$f" -vcodec libx265 -preset fast -b:v 1200k \
      -acodec aac -b:a 128k -vf "scale=-1:720" "$out720"
  fi

  echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 完了 ====="
done

# ── 完了通知 ─────────────────────────────────────────────────────────
msg="全 ${total} 件中 $((total - missing)) 件を処理しました（不在でスキップ: ${missing} 件）"
echo "$msg"
osascript -e "display notification \"${msg}\" with title \"FFmpeg 変換完了\"" 2>/dev/null || true
