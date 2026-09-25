# TODO

実運用するまでのセットアップチェックリスト。自分のドメイン・R2 バケット・認証トークンを用意したら順に進める。プレースホルダは実値に置換すること（`{DOMAIN}` = 使うドメイン、`{BUCKET_NAME}` = R2 バケット名）。

## 1. ドメイン / Cloudflare 側

- [ ] `{DOMAIN}` のネームサーバーを Cloudflare に委譲（現状の registrar から Cloudflare が提示する 2 本の `*.ns.cloudflare.com` に張り替え）
- [ ] Cloudflare R2 を有効化（支払い情報登録が必要。無料枠: ストレージ 10 GB/月、Class A 操作 1M/月、Class B 10M/月）
- [ ] R2 バケット `{BUCKET_NAME}` を作成
- [ ] `worker/wrangler.toml` の `bucket_name` を `{BUCKET_NAME}` に揃え、`[[routes]]` の `pattern` と `zone_name` を `{DOMAIN}` に合わせてコメント解除
- [ ] `{DOMAIN}` の apex にプロキシ有効（オレンジ雲 ON）のダミー A レコード `192.0.2.1` を追加（Workers ルート発火用）
- [ ] `bun add -g wrangler` で `wrangler` を導入（初回のみ）
- [ ] `wrangler login` で Cloudflare 認証
- [ ] `openssl rand -hex 32` でトークンを生成し、`wrangler secret put UPLOAD_TOKEN` で Worker に登録
- [ ] 同じトークン値を `~/.config/refrain/token` (chmod 600) に配置（CLI 側）
