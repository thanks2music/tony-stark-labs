# Spec 004: Refrain を専用サブドメインの Custom Domain で動かす

Related: [plan.md](./plan.md), [tasks.md](./tasks.md), [specs/003-refrain-import/spec.md](../003-refrain-import/spec.md)

## 目的

取り込み時点の Refrain は、以前のドメインの apex の下（`/apps/refrain/*`）に Workers の Route で載せる前提だった。しかしその Worker と R2 バケットはもう存在しない。新しく取得したドメインの**専用サブドメイン**（以下 `{DOMAIN}`。Refrain 専用のホスト名）に、Workers の **Custom Domain** で載せ直し、Mac からアップロードできる状態に戻す。

あわせて、取り込み時のレビューで後回しにした、アップロード経路の守りと CLI の不具合を直す。

## ユーザーストーリー

- CEO として、Mac のホットキーで撮ったスクリーンショットが `{DOMAIN}` にアップロードされ、Image URL がクリップボードに入る
- CEO として、main にマージすると、テストを通った Worker だけが自動でデプロイされる
- CEO として、公開リポジトリに `{DOMAIN}` を書かずに運用できる

## 受け入れ条件

### Worker

- `POST /upload` で受け付け、Image URL は `https://{DOMAIN}/i/<hash>.png` になる（パスの前置き `/apps/refrain` を外す）
- 20 MB を超えるアップロードは 413 を返す（`Content-Length` で本体を読む前に判定し、届いた本体の大きさでも判定する）。`Content-Length` の無いリクエストは 411 を返す
- PNG でない内容（先頭 8 バイトが PNG のシグネチャでない）は 415 を返す
- 画像の配信に `X-Content-Type-Options: nosniff` を付ける
- Upload Token の比較で長さが漏れない（両方を SHA-256 にかけてから `timingSafeEqual` で比べる）
- `wrangler.toml` は `[[routes]]` を持たず、`workers_dev = false`・`preview_urls = false`

### デプロイ

- CI は `turbo run deploy --filter=refrain-worker -- --domain "$REFRAIN_DOMAIN"` でデプロイし、turbo の `deploy` タスクが先に test を実行する
- `REFRAIN_DOMAIN`・`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID` の secrets が無ければ、deploy は失敗する（spec 003 で入れた「飛ばす」挙動をやめる）
- CI 用の API トークンは、Workers の Editor と、対象 zone の Workers Routes Write だけを持つ

### CLI

- エンドポイントは `https:` の URL でなければ拒否する（`http:` はローカル開発の `localhost`・`127.0.0.1` だけ許す）。`{DOMAIN}` を含む値も、この判定で拒否される
- `normalizeDpi` が失敗しても、一時ファイルが消える
- DPI の正規化で `sips -z` に渡すサイズを整数に丸める

### 運用（リポジトリの外）

- R2 バケット `refrain` があり、Worker から読み書きできる
- `{DOMAIN}` で、認証なしの POST が 401、正しいトークンでのアップロードが 200 と Image URL、その URL の GET が画像を返す

## スコープ外

- Phase 2（組織向けの AWS 版）と Phase 3（Mac アプリ）
- 既存の Image URL の互換性（旧 Worker と旧 URL は存在しない）
- ツールのメジャー版の更新（別の PR）

## 影響範囲

- `apps/refrain/worker/`（ルーティング・検証・`wrangler.toml`・テスト）
- `apps/refrain/cli/`（エンドポイントの検証・一時ファイル・サイズの丸め・テスト）
- `.github/workflows/deploy-refrain.yml`、`turbo.json`
- `AGENTS.md`、`README.md`、`apps/refrain/README.md`、ADR（`docs/adr/0002`、`apps/refrain/docs/adr/0001`）
