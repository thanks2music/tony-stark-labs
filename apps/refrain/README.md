# Refrain

独自ドメイン（`{DOMAIN}`）で運用する、Gyazo ライクな画像アップロードシステム。

- **Phase 1（個人用）**: Cloudflare Workers + R2 + Bun CLI (macOS)
- **Phase 2（会社用）**: AWS S3 へストレージを切替可能な抽象化を前提とした設計

[Gyazo 公式の OSS クライアント群](https://github.com/gyazo) は DPI 正規化ロジックやハッシュによる content-addressable URL 設計を参考にするのみで、クライアント／サーバーとも新規実装する。既存 Gyazo アプリとのプロトコル互換性は持たない。

## アーキテクチャ

```
┌──────────────────────┐   Bearer token + PNG(multipart)    ┌──────────────────────────┐
│  Bun CLI (macOS)     │ ─────────────────────────────────► │  Cloudflare Worker       │
│  screencapture -i    │                                    │  POST /apps/refrain/upload │
│  → POST              │ ◄───────────── text/plain URL ──── │  → R2.put(<hash>.png)    │
│  → pbcopy URL        │                                    │                          │
└──────────────────────┘                                    │  GET /apps/refrain/i/<h>   │
                                                            │  → R2.get → 画像         │
                                                            └──────────────────────────┘
                                                                    │
                                                                    ▼
                                                            ┌──────────────────────┐
                                                            │ R2 bucket            │
                                                            │ {BUCKET_NAME}        │
                                                            │ key: <hash>.png      │
                                                            └──────────────────────┘
```

- 画像 URL 形式: `https://{DOMAIN}/apps/refrain/i/<hash>.png`
- `<hash>` は SHA-256 先頭 32 文字（16 バイト）の hex。同一画像のアップロードは同一 URL に冪等に収束する。
- アップロード認証は単一 Bearer Token（`UPLOAD_TOKEN` Secret）。Phase 2 でマルチユーザー化する場合はこの層だけ差し替える。

## プロジェクト構成

Bun workspaces のモノレポ（`worker/` と `cli/`）。

```
./
├── worker/                    # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts           # ルーター + upload + 配信
│   │   ├── storage.ts         # Storage interface + R2 実装（Phase 2 で S3 実装追加）
│   │   └── hash.ts            # SHA-256 先頭 32 文字
│   ├── test/                  # Vitest + @cloudflare/vitest-pool-workers
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
├── cli/                       # Bun CLI (macOS)
│   ├── src/
│   │   ├── index.ts           # エントリ
│   │   ├── capture.ts         # screencapture + sips での DPI 正規化
│   │   ├── upload.ts          # fetch で POST
│   │   └── config.ts          # ~/.config/refrain/config.json 読込
│   ├── test/                  # bun:test
│   ├── package.json
│   └── tsconfig.json
├── package.json               # workspaces + 共通 lint/format
├── tsconfig.base.json
├── eslint.config.js           # ESLint 9 (flat config)
├── .prettierrc
├── TODO.md                    # 実運用前のセットアップチェックリスト
└── README.md
```

## エンドポイント仕様（Worker）

### `POST /apps/refrain/upload`

| ヘッダ / フィールド     | 値                      |
| ----------------------- | ----------------------- |
| `Authorization`         | `Bearer <UPLOAD_TOKEN>` |
| Content-Type            | `multipart/form-data`   |
| `imagedata`（フォーム） | PNG バイナリ            |

- 成功時: `200 OK`、`text/plain` で `https://{DOMAIN}/apps/refrain/i/<hash>.png\n` を 1 行返す。
- 認証失敗: `401 Unauthorized`。
- 同じ画像を 2 回送ると同じ URL が返る（`<hash>` ベースの冪等性）。

### `GET /apps/refrain/i/:hash.png`

- `:hash` は `[0-9a-f]{32}` でバリデーション。不一致は `404`。
- 該当オブジェクトを R2 から取得し、`content-type: image/png`、`cache-control: public, max-age=31536000, immutable` で返す。
- 見つからなければ `404`。

## CLI 仕様

```
refrain                    # screencapture -i で矩形選択 → アップロード
refrain <file.png>         # 既存ファイルをアップロード
refrain --open             # アップロード後に画像 URL をブラウザで開く
refrain --no-copy          # pbcopy にコピーしない
```

処理フロー:

1. `~/.config/refrain/config.json` から `endpoint` と `tokenPath` を読む。未設定なら対話で作成。
2. 引数にファイルパスがあればそれを、なければ `screencapture -i /tmp/refrain-<pid>.png` で矩形選択 UI を起動。
3. `sips` で 72dpi 換算（Retina ディスプレイでの論理解像度保持。[Gyazo 公式 macOS クライアント](https://github.com/gyazo/Gyazo)の `Gyazo/script` から移植）。
4. `fetch` で `imagedata` を multipart POST。`Authorization: Bearer <token>` を添える。
5. 非 2xx は stderr にエラー出力して exit 1。
6. `--no-copy` でない限り `pbcopy` に URL を投入、`--open` なら `open` で開き、stdout にも URL を 1 行出力（Raycast / Alfred 等から再利用しやすくするため）。
7. 一時ファイルを削除。

### 配布

`cli/package.json` に定義された `build` / `build:x64` スクリプトで、Bun ランタイム同梱の単一バイナリ（約 60 MB）を生成する。詳細な手順は下の **セットアップ手順 → 2. CLI セットアップ** と **3. ホットキー登録（macOS）** を参照。

## セットアップ手順

前提として、ドメイン・R2 バケット・`UPLOAD_TOKEN` の準備が完了している必要がある。未着手の場合は先に [TODO.md](./TODO.md) のチェックリストを通すこと。

### 1. Worker デプロイ

```bash
cd worker
bun install
wrangler deploy
```

### 2. CLI セットアップ

> 実アップロードは **1. Worker デプロイ** 完了 + 独自ドメインの DNS 有効化が前提。CLI 自体のビルドと `refrain --help` はオフラインでも完結する。

バイナリをビルドして `~/bin/` に配置する。Apple Silicon の場合:

```bash
cd cli
bun install
bun run build              # → cli/dist/refrain (Apple Silicon)
# Intel Mac なら: bun run build:x64
mkdir -p ~/bin
mv dist/refrain ~/bin/
```

`~/bin` が PATH に通っていない場合は一度だけ追加する:

```bash
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc   # bash の場合は ~/.bash_profile
source ~/.zshrc
refrain --help   # 動作確認
```

`UPLOAD_TOKEN` を置く:

```bash
mkdir -p ~/.config/refrain
printf '%s' '<UPLOAD_TOKEN と同じ値>' > ~/.config/refrain/token
chmod 600 ~/.config/refrain/token
```

`~/.config/refrain/config.json` は**初回実行時に対話で作成される**（`endpoint` と `tokenPath` にデフォルト値が提示されるので Enter で確定すれば良い）。

### 3. ホットキー登録（macOS）

`refrain` は `screencapture -i` を呼ぶ CLI なので、ホットキーで起動すれば Gyazo 公式アプリと同等の「矩形選択 → アップロード → URL 貼り付け」体験が得られる。

#### Option A: macOS 標準「ショートカット.app」

1. **ショートカット.app** を開き、左上「+」で新規ショートカット作成
2. サイドバーから「**シェルスクリプトを実行**」をドラッグ
3. シェルを `/bin/zsh` に設定、スクリプト欄に `refrain`（または `$HOME/bin/refrain` のフルパス）を入力
4. 右上「情報」ボタン → 「**キーボードショートカット**」 → 任意のホットキー（例: `⌃⌥⇧G`）を割り当て
5. 名前を `refrain` に設定（Shortcuts.app は自動保存される）

#### Option B: Raycast Script Command

Raycast の Script Commands ディレクトリに以下の `.sh` を配置:

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Refrain
# @raycast.mode silent
# @raycast.packageName Refrain

"$HOME/bin/refrain"
```

実行権限を付与（`chmod +x`）し、Raycast Settings → Extensions で当該 script を選んでホットキーを割り当てる。

#### Option C: Alfred Workflow

Alfred の **Hotkey Trigger** → **Run Script** で `$HOME/bin/refrain` を実行する Workflow を作成。

### 4. スクリーン録画権限（TCC）の付与

`screencapture -i` は macOS のプライバシー保護の対象で、**呼び出し元アプリ**（ショートカット.app / Raycast / Alfred など、`refrain` を起動する GUI アプリ。Terminal から直接叩いた場合は Terminal.app / iTerm.app 自身）に画面収録権限が必要。

- **ショートカット.app 経由**: 初回実行時に「"ショートカット" から画面収録を求められています」のダイアログが出る → 許可
- **Raycast / Alfred 経由**: 同様に呼び出し元アプリが許可対象
- **システム設定 → プライバシーとセキュリティ → 画面収録** で手動追加も可能

許可後、macOS の要求でアプリ再起動が必要な場合あり。失敗例として「矩形選択 UI は出るが保存された PNG が真っ黒」は権限未付与の典型症状。

## ローカル検証

```bash
# Worker をローカル起動（R2 はエミュレート）
cd worker && wrangler dev

# 別ターミナルで:

# 401 を確認
curl -i -X POST http://127.0.0.1:8787/apps/refrain/upload -F imagedata=@test.png

# 200 + URL を確認
curl -X POST http://127.0.0.1:8787/apps/refrain/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -F imagedata=@test.png

# 返却 URL の画像を取得
curl -o roundtrip.png "http://127.0.0.1:8787/apps/refrain/i/<hash>.png"
diff test.png roundtrip.png  # 一致すること

# 同じ画像を 2 回送って同じ URL が返ることを確認（冪等性）
```

## Phase 2: AWS S3 への切替

- `worker/src/storage.ts` に定義する `Storage` interface (`put` / `get`) の S3 実装を追加する。
- Worker から AWS SigV4 を生成する場合は [`aws4fetch`](https://github.com/mhart/aws4fetch) のような軽量ライブラリを使う。
- 既存 R2 データは `rclone` で S3 にコピーする（マイグレーション手順は Phase 2 着手時に別途計画）。
- Worker の binding と環境変数で R2 / S3 を切替可能にしておく。

## 認証モデルの将来拡張

Phase 1 は単一 Bearer Token だが、会社用途（Phase 2）でマルチユーザー化する場合は以下のいずれかへ差し替える:

- 複数 Bearer Token + ユーザー識別（最小変更）
- OAuth access_token（`gyazo-ruby` gem 互換にしたい場合）

どちらの場合もストレージレイヤ（R2/S3）の契約は変わらない。

## 参考にしたオリジナル Gyazo OSS

| リポジトリ                                              | 参考にした要素                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [gyazo/Gyazo](https://github.com/gyazo/Gyazo) (macOS)   | `Gyazo/script` の `screencapture -i` + `sips` で 72dpi 正規化するロジック       |
| [gyazo/Gyazo](https://github.com/gyazo/Gyazo) (Server)  | `Server/upload.cgi` のハッシュベース content-addressable なオブジェクトキー設計 |
| [gyazo/gyazo-ruby](https://github.com/gyazo/gyazo-ruby) | モダン API レスポンス JSON の項目（将来閲覧ページを足す際の参考）               |

## ライセンス

個人プロジェクト。外部公開用ライセンスは未定。
