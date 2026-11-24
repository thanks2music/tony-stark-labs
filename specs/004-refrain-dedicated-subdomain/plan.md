# Plan 004: 専用サブドメインへの移行と、アップロード経路の守り

Related: [spec.md](./spec.md), [tasks.md](./tasks.md)

## 変更対象

| ファイル                                      | 変更                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/refrain/worker/src/index.ts`            | ルートを `/upload` と `/i/<hash>.png` に。サイズ上限・PNG のシグネチャ・`nosniff`・トークン比較 |
| `apps/refrain/worker/test/index.test.ts`      | 上記のテスト（先に Red を commit する）                                                         |
| `apps/refrain/worker/wrangler.toml`           | `workers_dev = false`・`preview_urls = false`。コメントを Custom Domain の方式に                |
| `apps/refrain/cli/src/config.ts`              | `assertUsableEndpoint` を、URL として検証する `parseEndpoint` に置き換える                      |
| `apps/refrain/cli/src/capture.ts`・`index.ts` | `-z` のサイズを丸める。一時ファイルを `normalizeDpi` の失敗でも消す                             |
| `apps/refrain/cli/test/*`                     | 上記のテスト                                                                                    |
| `.github/workflows/deploy-refrain.yml`        | turbo 経由の deploy と `--domain`。secrets が無ければ失敗                                       |
| `turbo.json`                                  | 変更なし（`deploy` は既に `dependsOn: ["test"]` と Cloudflare の env を持つ）                   |
| ドキュメント                                  | `REFRAIN_ROUTE` を `REFRAIN_DOMAIN` に、Route を Custom Domain に、パスを新しい形に             |

## 設計判断

| 論点                      | 決定                                                                                                                             | 根拠                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route か Custom Domain か | Custom Domain                                                                                                                    | Worker がオリジンなら Custom Domain を使う、と Cloudflare が案内している。DNS レコードと証明書が自動で作られ、ダミーの A レコードが要らない（[Routes and domains](https://developers.cloudflare.com/workers/configuration/routing/)） |
| ドメインの渡し方          | deploy 時に `wrangler deploy --domain "$REFRAIN_DOMAIN"`                                                                         | `wrangler.toml` に書くと公開リポジトリに載る。`--domain` は wrangler 4 の `deploy` のフラグ                                                                                                                                           |
| パスの前置き              | 外す                                                                                                                             | サブドメインが Refrain 専用なので、前置きは何とも衝突しない（ADR 0002）                                                                                                                                                               |
| サイズ上限                | 20 MB。`Content-Length` は multipart の境界の分として 64 KiB の余裕を見て先に弾き、本体を読んだ後に `File.size` で正確に判定する | 5K のフルスクリーン PNG も通る。Workers のメモリは 128 MB                                                                                                                                                                             |
| PNG の判定                | 先頭 8 バイトのシグネチャ（`89 50 4E 47 0D 0A 1A 0A`）                                                                           | 保存も配信も `image/png` 固定なので、中身を揃える                                                                                                                                                                                     |
| トークンの比較            | 両方を SHA-256 にかけてから `timingSafeEqual`                                                                                    | 長さが違うときに早く返すと、トークンの長さが分かる                                                                                                                                                                                    |
| CLI の `http:`            | `localhost`・`127.0.0.1` だけ許す                                                                                                | `wrangler dev` での動作確認に使う。それ以外は平文でトークンを送ることになる                                                                                                                                                           |
| 初回デプロイ              | 手元から（`wrangler login` の後）                                                                                                | 新しい Worker を作るには Workers の Admin 権限が要る。CI のトークンを Editor に絞れる（[Workers authorization](https://developers.cloudflare.com/workers/authorization/workers/)）                                                    |

## テスト戦略

- Worker: `@cloudflare/vitest-pool-workers` で、ルート・401・413（ヘッダと本体の両方）・415・`nosniff`・正しいトークンでの 200 を確かめる
- CLI: `parseEndpoint`（https・localhost の http・それ以外の http・URL でない値・`{DOMAIN}`）、サイズの丸め（`computeNormalizedSize`）
- 一時ファイルの後始末は `Bun.spawn` を伴うので、ユニットテストではなく、`index.ts` の流れを読み直して確かめる
- 本番の疎通確認は、デプロイ後に `curl` で行う（401 → 200 → GET）
