# Refrain のホスト名をリポジトリに書かず、デプロイ時に渡す

このリポジトリは公開しているので、Refrain を載せるホスト名を `wrangler.toml`・ソース・ドキュメントに書かない。Worker には `wrangler deploy --domain` で渡し、CI では GitHub Actions の secret（`REFRAIN_DOMAIN`）から渡す。CLI は環境変数か `~/.config/refrain/config.json` からエンドポイントを読み、コンパイル時の既定値を持たない。

これは秘匿のためではない。Image URL を外に貼れば、ホスト名は誰にでも見える。それでもリポジトリに書かないのは、検索で個人の運用先と結び付けられにくくするためと、fork した人が自分のホスト名でそのまま使えるようにするためである。アップロードを守っているのは Upload Token だけである。

## Consequences

- secret は `vars` ではなく `secrets` に置く。`vars` はワークフローのログに平文で出る
- ホスト名を変えるときは、`REFRAIN_DOMAIN` の secret と、各 Mac の `~/.config/refrain/config.json` を両方変える。`--domain` は Custom Domain を追加するだけで、古いものは消さない（`wrangler.toml` に宣言していないため）。古い Custom Domain は Cloudflare のダッシュボード（Worker の Settings > Domains & Routes）で消す
