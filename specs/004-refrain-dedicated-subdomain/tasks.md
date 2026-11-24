# Tasks 004: 専用サブドメインへの移行

Related: [spec.md](./spec.md), [plan.md](./plan.md)

## リポジトリ（PR）

- [ ] spec・plan・tasks を commit
- [ ] Red: Worker のテスト（新しいパス・413・415・`nosniff`）
- [ ] Green: Worker の実装（ルート・サイズ上限・PNG の判定・`nosniff`・トークン比較）
- [ ] Red: CLI のテスト（`parseEndpoint`・サイズの丸め）
- [ ] Green: CLI の実装（`parseEndpoint`・丸め・一時ファイルの後始末）
- [ ] `wrangler.toml`: `workers_dev = false`・`preview_urls = false`
- [ ] `deploy-refrain.yml`: turbo 経由・`--domain "$REFRAIN_DOMAIN"`・secrets が無ければ失敗
- [ ] ドキュメント: AGENTS.md・README・`apps/refrain/README.md`・ADR 0002・`apps/refrain/docs/adr/0001`
- [ ] `bun run check` と `turbo run lint typecheck test` が通る
- [ ] `wrangler deploy --dry-run` が通る

## 運用（リポジトリの外。PR のマージ前に済ませる）

- [ ] R2 バケット `refrain` を作る
- [ ] `wrangler login` → 手元から初回デプロイ（`--domain`）
- [ ] `UPLOAD_TOKEN` を生成して `wrangler secret put`。同じ値を `~/.config/refrain/token`（chmod 600）に置く
- [ ] CI 用の API トークン（Workers Editor + zone の Workers Routes Write）を発行
- [ ] GitHub の secrets（`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`・`REFRAIN_DOMAIN`）を登録。旧 `REFRAIN_ROUTE` は作らない
- [ ] `~/.config/refrain/config.json` の endpoint を `https://{SHOTS_HOST}/upload` に
- [ ] 疎通確認: 認証なしの POST が 401、CLI でのアップロードが 200 と Image URL、その URL の GET が画像を返す
