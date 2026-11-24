# pg-lineage

ポール・ジョージ（PG）の移籍の連鎖（2010〜2026）を図で整理した、個人用の実験の作業場所。このリポジトリで追跡するのはこの README だけで、素材と成果物はコミットしない（`.gitignore` で除外している）。

## このディレクトリに置くもの（いずれもコミットしない）

| ファイル     | 内容                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| `pg.mp3`     | 元動画の音声（約 8 分 48 秒、48 kHz ステレオ）                                                |
| `pg.txt`     | `pg.mp3` の日本語の文字起こし（1 行 1 発話）。図の内容の土台にした                            |
| `HANDOFF.md` | 図を作った Claude Code のセッションの引き継ぎ。目的・作業の流れ・決定事項・事実確認の出典など |
| `index.html` | 成果物（3 種類の図を 1 枚にまとめた Web ページ）のローカルコピー                              |

## 元にした動画

YouTube「【黒幕】ポールジョージがNBAを盛り上げすぎている」（チキチキNBA tv、2025 年）
https://www.youtube.com/watch?v=FWqwpBgsWe4

## `pg.mp3` と `pg.txt` の作り方

### 当時の記録（2026-09-30）

- 音声は `yt-dlp` で動画から取り出した（`pg.mp3`）
- 文字起こしは [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)（Apple Silicon 向けの Whisper）で、モデル `mlx-community/whisper-large-v3-turbo` を使って作った（`pg.txt`）
- YouTube の自動生成字幕は誤認識が多かったため、Whisper の結果を正とした
- 当時実行したコマンドのフラグは記録が残っていない

### 作り直す手順

当時と同じツールで作り直すときのコマンド。2026-11-24 に、yt-dlp 2026.10.26 と mlx-whisper 0.4.3（Python 3.14）で確かめた。`pg.mp3` の先頭 20 秒で文字起こしを試し、`pg.txt` とほぼ同じ文（助詞 1 か所などの差）が出ることを確認している。

前提: macOS（Apple Silicon）、`brew install yt-dlp ffmpeg`、`pip install mlx-whisper`

```bash
cd experiments/pg-lineage

# 1. 動画から音声だけを mp3 で取り出す（ffmpeg が必要）
yt-dlp -x --audio-format mp3 -o 'pg.%(ext)s' 'https://www.youtube.com/watch?v=FWqwpBgsWe4'

# 2. 日本語で文字起こしして pg.txt を作る（初回はモデルを Hugging Face から取得する）
mlx_whisper pg.mp3 \
  --model mlx-community/whisper-large-v3-turbo \
  --language ja \
  --output-format txt \
  --output-dir .
```

- `--model` を省くと既定の `whisper-tiny` になり、精度が大きく落ちる
- 字幕形式が欲しいときは `--output-format srt`（全形式なら `all`）にする
- Whisper の出力にも誤認識は残る（例: 「復帰」が「復旧」になる）。固有名詞は動画と照らして直す
