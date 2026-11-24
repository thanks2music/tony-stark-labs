#!/usr/bin/env bash
#
# convert-batch.sh — 重い FFmpeg 変換を 1 本ずつ「順番に」実行するバッチ
#
# 使い方とオプションは `convert-batch.sh --help`、詳しい説明は scripts/README.md を参照。
#
# 同時実行はしない（1 本終わるまで次を開始しない＝順次実行）。
# 変換中は一時ファイル（.<name>.part.mp4）に書き出し、検証に通ったときだけ本来の名前へ mv する。
# そのため中断しても不完全な出力ファイルは残らない。
#
set -uo pipefail

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
                         （優先順位: --output > 環境変数 CONVERT_OUTDIR。どちらも無ければエラー）

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
# getopts は長いオプション（--1080p など）を扱えないため、while/case で読む。
MAKE_1080P=1
MAKE_720P=1
DRY_RUN=0
FORCE=0
OUTDIR=''
files=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --1080p)
      MAKE_720P=0
      shift
      ;;
    --720p)
      MAKE_1080P=0
      shift
      ;;
    --both)
      MAKE_1080P=1
      MAKE_720P=1
      shift
      ;;
    -o | --output)
      if [ "$#" -lt 2 ] || [ -z "$2" ] || [ "${2#-}" != "$2" ]; then
        echo "エラー: $1 には出力先ディレクトリを指定してください。" >&2
        exit 1
      fi
      OUTDIR="$2"
      shift 2
      ;;
    -n | --dry-run)
      DRY_RUN=1
      shift
      ;;
    -f | --force)
      FORCE=1
      shift
      ;;
    -h | --help)
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

# --1080p は 720p を、--720p は 1080p を外すので、両方を指定すると何も残らない
if [ "$MAKE_1080P" -eq 0 ] && [ "$MAKE_720P" -eq 0 ]; then
  echo "エラー: --1080p と --720p は同時指定できません。両方が必要なら --both を使ってください。" >&2
  exit 1
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "使い方: $0 [オプション] <変換元.mp4> [追加ファイル ...]" >&2
  echo "       詳細は $0 --help" >&2
  exit 1
fi

# ── 出力先の解決（--output > CONVERT_OUTDIR） ─────────────────────────
# 出力先は手元のディスク構成に依存するので、スクリプトには既定値を持たせない。
OUTDIR="${OUTDIR:-${CONVERT_OUTDIR:-}}"
if [ -z "$OUTDIR" ]; then
  echo "エラー: 出力先が決まっていません。--output で指定するか、環境変数 CONVERT_OUTDIR を設定してください。" >&2
  exit 1
fi
[ "$OUTDIR" != '/' ] && OUTDIR="${OUTDIR%/}"

# ── 事前チェック（dry-run では、外付けボリュームが無くても予定を表示できるよう緩める） ──
if [ "$DRY_RUN" -eq 0 ]; then
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
fi

if [ ! -d "$OUTDIR" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "警告: 出力先が見つかりません（dry-run なので続行します）: $OUTDIR" >&2
  else
    echo "エラー: 出力先が見つかりません: $OUTDIR" >&2
    echo "       外付けボリュームがマウントされているか、出力先の指定が正しいか確認してください。" >&2
    exit 1
  fi
fi

# ── 出力名 ───────────────────────────────────────────────────────────
# ディレクトリと拡張子を除いたファイル名。
# 末尾の `(WIDTHxHEIGHT)` 形式の解像度サフィックスだけを取り除く
# （例: `YOUR-FILE-(1920x1080)` → `YOUR-FILE`）。直前の `-` / スペース / `_` も併せて除去する。
output_name() { # <入力パス>
  basename "${1%.*}" | sed -E 's/[-_ ]?\([0-9]+x[0-9]+\)$//'
}

# 解像度サフィックスを除くと同じ名前になる入力があると、出力が衝突する（後の入力がスキップ、
# --force なら上書きされる）。変換を始める前に検出して止める。
seen_names=$'\n'
for f in "${files[@]}"; do
  name="$(output_name "$f")"
  case "$seen_names" in
    *$'\n'"$name"$'\n'*)
      echo "エラー: 出力名が重複する入力があります: ${name}（解像度サフィックスを除くと同じ名前になります）" >&2
      exit 1
      ;;
  esac
  seen_names+="${name}"$'\n'
done

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
trap 'cleanup_tmp; exit 130' INT
trap 'cleanup_tmp; exit 143' TERM

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
    elif mv -f "$tmp" "$dst"; then
      CURRENT_TMP=''
      completed+=("$dst")
      return 0
    else
      echo "  → ${label}: 一時ファイルの移動に失敗しました（一時ファイルは削除します）: $dst" >&2
    fi
  else
    echo "  → ${label} の変換に失敗しました: $dst" >&2
  fi

  rm -f "$tmp"
  CURRENT_TMP=''
  return 1
}

# convert_target <ラベル> <入力> <出力> <高さ> <エンコーダ引数...>
# 既存の出力は --force が無ければスキップする。dry-run では予定を 1 行表示するだけ。
convert_target() {
  local label="$1" dst="$3"
  if [ -f "$dst" ] && [ "$FORCE" -eq 0 ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "      スキップ（既存）: $(basename "$dst")   ※ --force で上書き"
    else
      echo "  → ${label} は既に存在するためスキップ: $dst"
      completed+=("$dst")
    fi
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -f "$dst" ]; then
      echo "      上書き生成      : $(basename "$dst")"
    else
      echo "      生成            : $(basename "$dst")"
    fi
    return 0
  fi
  encode "$@"
}

# ── 変換ループ ───────────────────────────────────────────────────────
total="${#files[@]}"
i=0
missing=0
failed_inputs=0
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

  name="$(output_name "$f")"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[$i/$total] $f"
  else
    echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 開始 ====="
  fi

  ok=1
  if [ "$MAKE_1080P" -eq 1 ]; then
    convert_target '1080p' "$f" "${OUTDIR}/${name}(1080p_H265).mp4" 1080 \
      -vcodec libx265 -b:v "$BITRATE_1080P" || ok=0
  fi
  if [ "$MAKE_720P" -eq 1 ]; then
    convert_target '720p' "$f" "${OUTDIR}/${name}(720p_H265).mp4" 720 \
      -vcodec libx265 -preset fast -b:v "$BITRATE_720P" || ok=0
  fi
  [ "$ok" -eq 0 ] && failed_inputs=$((failed_inputs + 1))

  if [ "$DRY_RUN" -eq 0 ]; then
    echo "===== [$(date '+%H:%M:%S')] ($i/$total) ${name} 完了 ====="
  fi
done

# ── 完了通知 ─────────────────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "dry-run 終了（全 ${total} 件中 不在: ${missing} 件）。実行するには --dry-run を外してください。"
  [ "$missing" -gt 0 ] && exit 1
  exit 0
fi

msg="全 ${total} 件中 $((total - missing)) 件を処理しました（不在でスキップ: ${missing} 件 / 変換に失敗した入力: ${failed_inputs} 件）"
echo ""
echo "$msg"

if [ "${#completed[@]}" -gt 0 ]; then
  echo "完了したファイル (${#completed[@]} 件) — 出力先: ${OUTDIR}"
  for c in "${completed[@]}"; do
    echo "  - $(basename "$c")"
  done
fi

osascript -e "display notification \"${msg}\" with title \"FFmpeg 変換完了\"" 2>/dev/null || true

if [ "$failed_inputs" -gt 0 ] || [ "$missing" -gt 0 ]; then
  exit 1
fi
exit 0
