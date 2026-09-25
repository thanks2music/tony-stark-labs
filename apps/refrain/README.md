# Refrain

独自ドメイン（`{DOMAIN}`）で運用する、Gyazo ライクな画像アップロードシステム。tony-stark-labs monorepo の `apps/refrain/` として配置され、`refrain-worker` と `refrain-cli` の 2 workspace で構成される。

- **Phase 1（個人用）**: Cloudflare Workers + R2 + Bun CLI (macOS)
- **Phase 2（会社用）**: AWS S3 へストレージを切替可能な抽象化を前提とした設計

> **`{DOMAIN}` について**: 本リポジトリは Public のため、実ドメインをソース・設定・ドキュメントのいずれにも記載しない。ドキュメント中の `{DOMAIN}` は読み替えること。実値の供給経路は CLI が `REFRAIN_ENDPOINT` 環境変数、Worker が deploy 時の `--routes` フラグ（CI では `secrets.REFRAIN_ROUTE`）。
>
> なお、これは「リポジトリに書かない」という運用上の配慮であり秘匿性は得られない。画像 URL を外部に貼れば第三者にドメインは見える。アップロード経路を守るのは `UPLOAD_TOKEN` のみである。

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
                                                            │ refrain              │
                                                            │ key: <hash>.png      │
                                                            └──────────────────────┘
```

- 画像 URL 形式: `https://{DOMAIN}/apps/refrain/i/<hash>.png`
- `<hash>` は SHA-256 先頭 32 文字（16 バイト）の hex。同一画像のアップロードは同一 URL に冪等に収束する。
- アップロード認証は単一 Bearer Token（`UPLOAD_TOKEN` Secret）。Phase 2 でマルチユーザー化する場合はこの層だけ差し替える。

## プロジェクト構成

monorepo 直下の 2 workspace。lint / format / TypeScript の設定は monorepo root に一本化されており、本ディレクトリには置かない。

```
apps/refrain/
├── worker/                    # workspace: refrain-worker
│   ├── src/
│   │   ├── index.ts           # ルーター + upload + 配信
│   │   ├── storage.ts         # Storage interface + R2 実装（Phase 2 で S3 実装追加）
│   │   └── hash.ts            # SHA-256 先頭 32 文字
│   ├── test/                  # Vitest + @cloudflare/vitest-pool-workers
│   ├── wrangler.toml          # [[routes]] は持たない（deploy 時に --routes で注入）
│   ├── worker-configuration.d.ts  # wrangler types の生成物。typecheck に必須なので追跡する
│   ├── vitest.config.ts
│   ├── package.json
│   └── tsconfig.json          # root の tsconfig.base.json を extends
├── cli/                       # workspace: refrain-cli
│   ├── src/
│   │   ├── index.ts           # エントリ
│   │   ├── capture.ts         # screencapture + sips での DPI 正規化
│   │   ├── upload.ts          # fetch で POST
│   │   └── config.ts          # エンドポイント解決 + ~/.config/refrain/config.json 読込
│   ├── test/                  # bun:test
│   ├── package.json
│   └── tsconfig.json          # root の tsconfig.base.json を extends
└── README.md
```

### コマンド

monorepo root から `--filter` で叩く。

```bash
bun run --filter refrain-worker dev        # wrangler dev
bun run --filter refrain-worker test       # Vitest (Workers pool)
bun run --filter refrain-worker cf-typegen # worker-configuration.d.ts を再生成
bun run --filter refrain-cli test          # bun:test
bun run --filter refrain-cli build         # macOS バイナリを cli/dist/refrain に生成
```

> ⚠️ `refrain-cli` の `build` は macOS 専用バイナリ（約 60 MB）をクロスコンパイルする。CI で `turbo run build` を回す場合は `--filter=!refrain-cli` を付けること。現行 CI は build を実行しない。

## 非自明な制約（変更前に必読）

monorepo 取り込み時に決めた、壊しやすい取り決め。

| 制約                                                                    | 理由                                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest を v3 に下げない**                                             | `@cloudflare/vitest-pool-workers` の peerDependencies が `vitest: ^4.1.0`。下げると `refrain-worker` のテストが起動しない。root の devDependencies に一本化してある         |
| **`wrangler.toml` を gitignore に戻さない**                             | `worker/vitest.config.ts` が `configPath: './wrangler.toml'` を参照する。無いと CI の `bun run test` が起動時に落ちる                                                       |
| **`wrangler.toml` に `[[routes]]` を書かない**                          | 本リポジトリは Public。ルートは deploy 時に `--routes` で注入する（`routes` は `workers_dev = true` なら省略可能）                                                          |
| **`worker-configuration.d.ts` を消さない**                              | `wrangler types` の生成物だが typecheck に必須。root `.gitignore` は同名を無視するので `!apps/refrain/worker/worker-configuration.d.ts` で例外化済み。再生成は `cf-typegen` |
| **`@cloudflare/vitest-pool-workers` / `wrangler` を root に昇格しない** | refrain 固有の依存であり、他 workspace には不要                                                                                                                             |
| **CLI にドメインのデフォルト値を持たせない**                            | `REFRAIN_ENDPOINT` → config.json → 対話プロンプトの順で解決する。`{DOMAIN}` を含む値はどの経路でも拒否される                                                                |
| **`prompt()` を `config.ts` へ移さない**                                | `config.ts` はテストから import されるため、読み込み時に stdin をブロックしてはならない。対話は `src/index.ts` に閉じる                                                     |

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

エンドポイントの解決順序:

1. `REFRAIN_ENDPOINT` 環境変数
2. `~/.config/refrain/config.json` の `endpoint`
3. 対話プロンプト（どちらも無い場合。入力値は config.json に保存される）

環境変数が設定されている場合は config.json を書き換えずにそちらが優先される。`{DOMAIN}` プレースホルダを含む値はいずれの経路でも拒否される。

処理フロー:

1. 上記の順序で `endpoint` を解決し、`tokenPath` を `~/.config/refrain/config.json` から読む。
2. 引数にファイルパスがあればそれを、なければ `screencapture -i /tmp/refrain-<pid>.png` で矩形選択 UI を起動。
3. `sips` で 72dpi 換算（Retina ディスプレイでの論理解像度保持。[Gyazo 公式 macOS クライアント](https://github.com/gyazo/Gyazo)の `Gyazo/script` から移植）。
4. `fetch` で `imagedata` を multipart POST。`Authorization: Bearer <token>` を添える。
5. 非 2xx は stderr にエラー出力して exit 1。
6. `--no-copy` でない限り `pbcopy` に URL を投入、`--open` なら `open` で開き、stdout にも URL を 1 行出力（Raycast / Alfred 等から再利用しやすくするため）。
7. 一時ファイルを削除。

### 配布

`cli/package.json` に定義された `build` / `build:x64` スクリプトで、Bun ランタイム同梱の単一バイナリ（約 60 MB）を生成する。詳細な手順は下の **セットアップ手順 → 2. CLI セットアップ** と **3. ホットキー登録（macOS）** を参照。

## 運用セットアップ（Cloudflare 側）

実運用するまでのチェックリスト。`{DOMAIN}` は使うドメインに読み替える。

- [x] `{DOMAIN}` のネームサーバーを Cloudflare に委譲（registrar から Cloudflare 提示の 2 本の `*.ns.cloudflare.com` に張り替え）
- [x] Cloudflare R2 を有効化（支払い情報登録が必要。無料枠: ストレージ 10 GB/月、Class A 操作 1M/月、Class B 10M/月）
- [x] R2 バケット `refrain` を作成
- [ ] `{DOMAIN}` の apex にプロキシ有効（オレンジ雲 ON）のダミー A レコード `192.0.2.1` を追加（Workers ルート発火用）
- [ ] `wrangler login` で Cloudflare 認証（`wrangler` は `refrain-worker` の devDependency なので個別インストールは不要）
- [ ] `openssl rand -hex 32` でトークンを生成し、`bun run --filter refrain-worker exec -- wrangler secret put UPLOAD_TOKEN` で Worker に登録
- [ ] 同じトークン値を `~/.config/refrain/token`（chmod 600）に配置（CLI 側）
- [ ] GitHub Actions に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `REFRAIN_ROUTE` の **secrets** を登録（`REFRAIN_ROUTE` は `{DOMAIN}/apps/refrain/*`）

> `wrangler.toml` に `[[routes]]` は書かない。ルートは deploy 時に `--routes` で注入する。ローカルから手動デプロイする場合も同様:
>
> ```bash
> bun run --filter refrain-worker deploy -- --routes "{DOMAIN}/apps/refrain/*"
> ```

## セットアップ手順

### 1. Worker デプロイ

上の「運用セットアップ」が完了している前提。monorepo root から:

```bash
bun install
bun run --filter refrain-worker deploy -- --routes "{DOMAIN}/apps/refrain/*"
```

ローカル検証だけなら `--dry-run` を付ける（ルート指定も Cloudflare 認証も不要）:

```bash
bunx wrangler deploy --dry-run --config apps/refrain/worker/wrangler.toml
```

### 2. CLI セットアップ

> 実アップロードは **1. Worker デプロイ** 完了 + 独自ドメインの DNS 有効化が前提。CLI 自体のビルドと `refrain --help` はオフラインでも完結する。

バイナリをビルドして `~/bin/` に配置する。Apple Silicon の場合:

```bash
bun run --filter refrain-cli build       # → apps/refrain/cli/dist/refrain
# Intel Mac なら: bun run --filter refrain-cli build:x64
mkdir -p ~/bin
mv apps/refrain/cli/dist/refrain ~/bin/
```

初回起動時にエンドポイントとトークンパスを対話で聞かれる。プロンプトを出したくない場合は環境変数を使う:

```bash
REFRAIN_ENDPOINT="https://{DOMAIN}/apps/refrain/upload" ~/bin/refrain
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
3. シェルを `/bin/zsh` に設定、スクリプト欄に `$HOME/bin/refrain` を入力
4. 右上「情報」ボタン → 「**キーボードショートカット**」 → 任意のホットキーを割り当て
5. 名前を `Refrain` に設定（Shortcuts.app は自動保存される）

> **現在の設定**: ショートカット.app に `Refrain` という名前で登録済み。割り当ては **`⌃⇧⌘R`**（Control + Shift + Command + R）。「クイックアクションとして使用」「サービスメニュー」「Spotlight に表示」が有効。
>
> 割り当てを確認・変更するには ショートカット.app → `Refrain` → 右上の ⓘ → 「キーボードショートカット」。この値は macOS 側（TCC 保護下の Shortcuts データベース）にのみ存在し、本リポジトリからは再現できない。

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
# Worker をローカル起動（R2 はエミュレート）。UPLOAD_TOKEN は worker/.dev.vars から読まれる
bun run --filter refrain-worker dev

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
