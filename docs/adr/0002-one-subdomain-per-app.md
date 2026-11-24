# アプリ 1 つにつき専用のサブドメインを 1 つ使い、パスに前置きを付けない

独自ドメインには複数のアプリを載せる予定がある。アプリはそれぞれ専用のサブドメイン（`<role>.<domain>` の形）に載せ、パスにアプリ名の前置き（`/apps/<name>/`）は付けない。サブドメインの名前はツール名ではなく役割名にする。ツールを差し替えても URL を変えずに済むためである。

## Considered Options

- **apex のパスで分ける（`/apps/<name>/`）**: 全アプリが同じ origin を共有するので、Cookie や localStorage がアプリ間で混ざる。Workers では Route で載せることになり、ダミーの DNS レコードが要る
- **サブドメインに加えて `/apps/<name>/` も付ける**: サブドメインがすでにアプリ専用なので、前置きは何とも衝突せず、飾りにしかならない。役割名のサブドメインにツール名のパスを足すと、上の意図にも反する

## Consequences

- Cloudflare Workers のアプリは Workers Custom Domain で載せる。Custom Domain はホスト名のすべてのパスを 1 つの Worker に向け、DNS レコードと証明書を自動で作る（[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)）
- 公開する URL（例: Image URL）はサブドメインのホスト名で決まり、後から変えにくい。名前は最初に慎重に選ぶ
