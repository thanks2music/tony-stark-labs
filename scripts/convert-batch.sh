#!/usr/bin/env bash
#
# convert-batch.sh — 重い FFmpeg 変換を 1 本ずつ「順番に」実行するバッチ
#
# 使い方:
#   ./convert-batch.sh [オプション] <変換元.mp4> [追加ファイル ...]
#
# オプション（ファイル引数の前後どちらに置いてもよい）:
#   -o, --output <DIR>     出力先ディレクトリ（既定: DEFAULT_OUTDIR / 環境変数 CONVERT_OUTDIR）
#   --1080p                1080p のみ生成
#   --720p                 720p のみ生成
#   --both                 両方生成（デフォルト）
#   -n, --dry-run          変換せず、生成予定のファイルだけ表示する
#   -f, --force            既存の出力ファイルを上書きする
#   -h, --help             この使い方を表示して終了
#
# 例（フルパス・スペース込みでも OK。必ずクォートで囲む）:
#   ./convert-batch.sh "/Volumes/.../2026-06-04-NBA.mp4" "/Volumes/.../2026-06-05.mp4"
#   ./convert-batch.sh --1080p "/path/A.mp4" "/path/B.mp4"
#   ./convert-batch.sh --720p /path/to/*.mp4
#   ./convert-batch.sh --dry-run -o ~/Movies/tmp "/path/A.mp4"
#
# 各入力につき OUTDIR に生成する（デフォルトは 2 本、フラグで片方だけも可）:
#   ① 1080p / H265            …(1080p_H265).mp4
#   ② 720p  / H265（モバイル用） …(720p_H265).mp4
#
# 同時実行はしない（& を付けないため、1 本終わるまで次を開始しない＝順次実行）。
# 変換中は一時ファイル（.<name>.part.mp4）に書き出し、成功時のみ本来の名前へ mv する。
# そのため中断しても不完全な出力ファイルは残らない。
#
set -uo pipefail

# ── 既定の出力先（年度が変わったらこの 1 行を変更する。--output でも上書き可） ──
DEFAULT_OUTDIR='/Volumes/KeepTheFaith18TB/01. Video/01. NBA/2025-2026-Season'

# ── エンコード設定 ────────────────────────────────────────────────────
# エンコーダは libx265（ソフトウェア）固定。実測 約 53fps（1080p60 素材）で CPU バウンド。
#
# hevc_videotoolbox（ハードウェア）は約 6.6 倍速いが、2026-08-02 の実測で不採用とした:
#   同じ画質を得るには libx265 より 30〜50% 多くビットを要する。2,191 kbps のソースに
#   2,500k を指定した結果、出力が 2,753 kbps・ソース比 +24% に膨らんだ。
#   「iPad 用に圧縮する」という本スクリプトの目的と構造的に噛み合わないため採用しない。
BITRATE_1080P='3000k'
BITRATE_720P='1200k'

# ── usage 表示 ────────────────────────────────────────────────────────
usage() {
  cat <<'EOF'
使い方: convert-batch.sh [オプション] <変換元.mp4> [追加ファイル ...]

出力:
  -o, --output <DIR>     出力先ディレクトリを指定する
                         （優先順位: --output > 環境変数 CONVERT_OUTDIR > スクリプト内の既定値）

解像度:
  --1080p                1080p のみ生成
  --720p                 720p のみ生成
  --both                 両方生成（デフォルト）

その他:
  -n, --dry-run          変換せず、生成予定のファイルだけ表示する
  -f, --force            既存の出力ファイルを上書きする
  -h, --help             この使い方を表示して終了

フラグはファイル引数の前後どちらに置いてもよい。
`-` で始まる名前のファイルを渡す場合は `--` の後ろに置くこと。

例:
  convert-batch.sh "/path/A.mp4"
  convert-batch.sh --1080p "/path/A.mp4" "/path/B.mp4"
  convert-batch.sh --720p /path/to/*.mp4
  convert-batch.sh --dry-run -o ~/Movies/tmp "/path/A.mp4"
EOF
}

# ── 引数パース ───────────────────────────────────────────────────────
MAKE_1080P=1
MAKE_720P=1
SET_1080P_ONLY=0
SET_720P_ONLY=0
DRY_RUN=0
FORCE=0
OUTDIR=''
files=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --1080p)
      MAKE_720P=0
      SET_1080P_ONLY=1
      shift
      ;;
    --720p)
      MAKE_1080P=0
      SET_720P_ONLY=1
      shift
      ;;
    --both)
      MAKE_1080P=1
      MAKE_720P=1
      SET_1080P_ONLY=0
      SET_720P_ONLY=0
      shift
      ;;
    -o|--output)
      if [ "$#" -lt 2 ]; then
        echo "エラー: $1 には出力先ディレクトリを指定してください。" >&2
        exit 1
      fi
      OUTDIR="$2"
      shift 2
      ;;
    -n|--dry-run)
      DRY_RUN=1
      shift
      ;;
    -f|--force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      files+=("$@")
      break
      ;;
    -*)
      echo "エラー: 未知のオプション: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      files+=("$1")
      shift
      ;;
  esac
done

if [ "$SET_1080P_ONLY" -eq 1 ] && [ "$SET_720P_ONLY" -eq 1 ]; then
  echo "エラー: --1080p と --720p は同時指定できません。両方が必要なら --both を使ってください。" >&2
  exit 1
fi

# ── 出力先の解決（--output > CONVERT_OUTDIR > 既定値） ───────────────
if [ -z "$OUTDIR" ]; then
  OUTDIR="${CONVERT_OUTDIR:-$DEFAULT_OUTDIR}"
fi
OUTDIR="${OUTDIR%/}"

# ── エンコード引数 ───────────────────────────────────────────────────
ARGS_1080P=(-vcodec libx265 -b:v "$BITRATE_1080P")
ARGS_720P=(-vcodec libx265 -preset fast -b:v "$BITRATE_720P")

# ── 事前チェック ─────────────────────────────────────────────────────
if [ "${#files[@]}" -eq 0 ]; then
  echo "使い方: $0 [オプション] <変換元.mp4> [追加ファイル ...]" >&2
  echo "       詳細は $0 --help" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "エラー: ffmpeg が見つかりません。'brew install ffmpeg' を実行してください。" >&2
  exit 1
fi

if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q 'libx265'; then
  echo "エラー: この ffmpeg は libx265 に対応していません。" >&2
  echo "       'brew reinstall ffmpeg' で入れ直してください。" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "エラー: ffprobe が見つかりません（出力の検証に必要です）。" >&2
  echo "       'brew install ffmpeg' を実行してください。" >&2
  exit 1
fi

if [ ! -d "$OUTDIR" ]; then
  echo "エラー: 出力先が見つかりません: $OUTDIR" >&2
  echo "       外付けボリュームがマウントされているか、--output の指定が正しいか確認してください。" >&2
  exit 1
fi

# ── 中断時の一時ファイル掃除 ─────────────────────────────────────────
CURRENT_TMP=''

# shellcheck disable=SC2329  # 直下の trap から間接的に呼ばれる
cleanup_tmp() {
  if [ -n "$CURRENT_TMP" ] && [ -f "$CURRENT_TMP" ]; then
    rm -f "$CURRENT_TMP"
    echo "" >&2
    echo "中断を検知しました。未完成の一時ファイルを削除しました: $(basename "$CURRENT_TMP")" >&2
  fi
}
trap 'cleanup_tmp; exit 130' INT TERM

# ── 出力の検証 ───────────────────────────────────────────────────────
# 秒数を取り出す（取得できなければ空文字）
probe_duration() { # <ファイル> [<ffprobe 追加引数>...]
  local file="$1"
  shift
  local value
  value="$(ffprobe -v error "$@" -show_entries stream=duration \
    -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null | head -1)"
  case "$value" in
    '' | 'N/A' | *[!0-9.]*) echo '' ;;
    *) echo "$value" ;;
  esac
}

# verify_output <入力> <出力>
#
# ffmpeg の終了コードだけでは「映像が途中で終わった出力」を検出できないため、
# 変換後に必ず ffprobe で実測して検証する。
#
# なお「再生中に映像が止まり音声だけ続く」症状は、多くの場合ソース録画側の破損である
# （CleverGet のダウンロードが映像だけ途中で失敗するケースを 2026-08-02 に確認）。
# 比較対象をソースの映像長にしてあるため、壊れたソースを忠実に変換した結果は
# 失敗扱いにならず、代わりに映像/音声のずれとして警告される。
verify_output() {
  local src="$1" dst="$2"
  local src_dur dst_v_dur dst_a_dur

  # 出力に映像ストリームが存在すること（読めない / 映像なしは失敗）
  if ! ffprobe -v error -select_streams v:0 -show_entries stream=index \
    -of default=noprint_wrappers=1:nokey=1 "$dst" 2>/dev/null | grep -q .; then
    echo "  → 検証失敗: 出力に映像ストリームがありません（ファイルが壊れています）" >&2
    return 1
  fi

  src_dur="$(probe_duration "$src" -select_streams v:0)"
  dst_v_dur="$(probe_duration "$dst" -select_streams v:0)"
  dst_a_dur="$(probe_duration "$dst" -select_streams a:0)"

  # ffprobe が長さを返さない形式では長さ比較をスキップする（誤検知で失敗扱いにしない）
  if [ -z "$src_dur" ] || [ -z "$dst_v_dur" ]; then
    echo "  ⚠ 出力の長さを検証できませんでした。再生を目視で確認してください。" >&2
    return 0
  fi

  # 映像がソースの 99% 未満なら打ち切りとみなす
  if awk -v s="$src_dur" -v d="$dst_v_dur" 'BEGIN { exit !(s > 0 && d < s * 0.99) }'; then
    awk -v s="$src_dur" -v d="$dst_v_dur" \
      'BEGIN { printf "  → 検証失敗: 映像が %.1f 秒しかありません（ソースは %.1f 秒 / %.1f%%）\n", d, s, d / s * 100 }' >&2
    return 1
  fi

  # 映像と音声の長さが 1 秒以上ずれていたら警告（ソース録画の破損を検知する）
  if [ -n "$dst_a_dur" ] &&
    awk -v v="$dst_v_dur" -v a="$dst_a_dur" 'BEGIN { exit !((v - a > 1) || (a - v > 1)) }'; then
    awk -v v="$dst_v_dur" -v a="$dst_a_dur" \
      'BEGIN { printf "  ⚠ 映像 %.1f 秒 / 音声 %.1f 秒 とずれています。ソース録画が壊れている可能性があります。\n", v, a }' >&2
  fi

  # 出力がソースより大きい場合は警告（圧縮目的に反するため）
  local src_size dst_size
  src_size="$(wc -c <"$src" 2>/dev/null | tr -d ' ')"
  dst_size="$(wc -c <"$dst" 2>/dev/null | tr -d ' ')"
  if [ -n "$src_size" ] && [ -n "$dst_size" ] &&
    awk -v s="$src_size" -v d="$dst_size" 'BEGIN { exit !(s > 0 && d > s) }'; then
    awk -v s="$src_size" -v d="$dst_size" '
      function human(b) { return b >= 2 ^ 30 ? sprintf("%.2f GiB", b / 2 ^ 30) : sprintf("%.0f MiB", b / 2 ^ 20) }
      BEGIN {
        printf "  ⚠ 出力がソースより大きくなりました（%s → %s / +%.0f%%）。\n", human(s), human(d), (d / s - 1) * 100
        print  "     ソースのビットレートが既に低い可能性があります。スクリプト先頭の BITRATE_* を見直してください。"
      }' >&2
  fi

  return 0
}

# ── 変換本体 ─────────────────────────────────────────────────────────
# encode <ラベル> <入力> <出力> <高さ> <エンコーダ引数...>
encode() {
  local label="$1" src="$2" dst="$3" height="$4"
  shift 4

  local tmp
  tmp="$(dirname "$dst")/.$(basename "${dst%.mp4}").part.mp4"
  CURRENT_TMP="$tmp"
  rm -f "$tmp"

  # scale の幅は -2（偶数に丸める）。-1 だと奇数幅になった際に H.265 エンコードが失敗する。
  if nice -n 10 ffmpeg -nostdin -y -i "$src" "$@" \
    -tag:v hvc1 -acodec aac -b:a 128k -vf "scale=-2:${height}" "$tmp"; then
    if ! verify_output "$src" "$tmp"; then
      echo "  → ${label}: 出力が不完全なため破棄しました（ffmpeg は成功を返していますが信用できません）" >&2
      rm -f "$tmp"
      CURRENT_TMP=''
      return 1
    fi
    if mv -f "$tmp" "$dst"; then
      CURRENT_TMP=''
      completed+=("$dst")
      return 0
    fi
    echo "  → ${label}: 一時ファイルの移動に失敗しました: $tmp" >&2
  else
    echo "  → ${label} の変換に失敗しました: $dst" >&2
    rm -f "$tmp"
  fi

  CURRENT_TMP=''
  return 1
}

# plan_line <出力パス> — dry-run で 1 行分の予定を表示する
plan_line() {
  local dst="$1"
  if [ -f "$dst" ] && [ "$FORCE" -eq 0 ]; then
    echo "      スキップ（既存）: $(basename "$dst")   ※ --force で上書き"
  elif [ -f "$dst" ]; then
    echo "      上書き生成      : $(basename "$dst")"
  else
    echo "      生成            : $(basename "$dst")"
  fi
}

# ── 変換ループ ───────────────────────────────────────────────────────
total="${#files[@]}"
i=0
missing=0
failed=0
completed=()

if [ "$MAKE_1080P" -eq 1 ] && [ "$MAKE_720P" -eq 1 ]; then
  targets='1080p + 720p'
elif [ "$MAKE_1080P" -eq 1 ]; then
  targets='1080p のみ'
else
  targets='720p のみ'
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "===== dry-run（変換は行いません） ====="
fi
echo "  エンコーダ : libx265 (1080p ${BITRATE_1080P} / 720p ${BITRATE_720P})"
echo "  出力先     : ${OUTDIR}"
echo "  生成対象   : ${targets}"
echo "  入力       : ${total} 件"
echo ""

for f in "${files[@]}"; do
  i=$((i + 1))

  if [ ! -f "$f" ]; then
    echo "[$i/$total] 警告: '$f' が見つかりません。スキップします。" >&2
    missing=$((missing + 1))
    continue
  fi

  # ディレクトリと拡張子を除いたファイル名。
  # 末尾に `(WIDTHxHEIGHT)` 形式の解像度サフィックスが付いている場合は取り除く
  # （例: `YOUR-FILE-(1920x1080)` → `YOUR-FILE`）。直前の `-` / スペース / `_` も併せて除去する。
  name="$(basename "${f%.*}" | sed -E 's/[-_ ]?\([0-9]+x[0-9]+\)//g')"
  out1080="${OUTDIR}/${name}(1080p_H265).mp4"
  out720="${OUTDIR}/${name}(720p_H265).mp4"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[$i/$total] $f"
    [ "$MAKE_1080P" -eq 1 ] && plan_line "$out1080"
    [ "$MAKE_720P" -eq 1 ] && plan_line "$out720"
    continue
  fi

  echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 開始 ====="

  # ① 1080p / H265
  if [ "$MAKE_1080P" -eq 1 ]; then
    if [ -f "$out1080" ] && [ "$FORCE" -eq 0 ]; then
      echo "  → 1080p は既に存在するためスキップ: $out1080"
      completed+=("$out1080")
    else
      encode '1080p' "$f" "$out1080" 1080 "${ARGS_1080P[@]}" || failed=$((failed + 1))
    fi
  fi

  # ② 720p / モバイル用
  if [ "$MAKE_720P" -eq 1 ]; then
    if [ -f "$out720" ] && [ "$FORCE" -eq 0 ]; then
      echo "  → 720p は既に存在するためスキップ: $out720"
      completed+=("$out720")
    else
      encode '720p' "$f" "$out720" 720 "${ARGS_720P[@]}" || failed=$((failed + 1))
    fi
  fi

  echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 完了 ====="
done

# ── 完了通知 ─────────────────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "dry-run 終了（全 ${total} 件中 不在: ${missing} 件）。実行するには --dry-run を外してください。"
  [ "$missing" -gt 0 ] && exit 1
  exit 0
fi

msg="全 ${total} 件中 $((total - missing)) 件を処理しました（不在でスキップ: ${missing} 件 / 変換失敗: ${failed} 件）"
echo ""
echo "$msg"

if [ "${#completed[@]}" -gt 0 ]; then
  echo "完了したファイル (${#completed[@]} 件) — 出力先: ${OUTDIR}"
  for c in "${completed[@]}"; do
    echo "  - $(basename "$c")"
  done
fi

osascript -e "display notification \"${msg}\" with title \"FFmpeg 変換完了\"" 2>/dev/null || true

if [ "$failed" -gt 0 ] || [ "$missing" -gt 0 ]; then
  exit 1
fi
exit 0
