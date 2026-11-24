# AGENTS.md

このリポジトリで作業する AI エージェント向けの規約。人間向けの説明は [README.md](./README.md) にあり、ここでは README と重ならない、作業時に守ることだけを書く。

## リポジトリ概要

[@thanks2music](https://github.com/thanks2music) の個人用 polyglot monorepo。アプリは `apps/` 配下に独立した workspace として置き、ツールチェーン（Bun / Turborepo / Biome / ESLint / CI）を共有する。ホスティングはアプリごとに選ぶ。

**このリポジトリは GitHub で公開している。** 秘密値だけでなく、実在のドメインや個人の識別子も書かない（「公開リポジトリとしての注意」）。

## コマンド

コマンドの一覧は README の「開発コマンド」節にある。コミット前に、次を通す。

```bash
bun run check && bun run lint && bun run typecheck && bun run test
```

## Commit ルール

- [Conventional Commits](https://www.conventionalcommits.org/) に従う（commitlint で自動検証）
- subject は lowercase で始める。`@commitlint/config-conventional` の既定で、sentence-case / start-case / pascal-case / upper-case は reject される
  - 例: `feat(root): bootstrap Bun workspaces + Turborepo monorepo`（文頭は lowercase、途中の固有名詞は大文字のままでよい）
- `Co-Authored-By:` などの AI の署名は付けない
- type と scope の使い分けは README の「Commit Convention」節を参照

## 開発手法（TDD + SDD）

- **SDD**: 新機能は `specs/NNN-<slug>/` に `spec.md` → `plan.md` → `tasks.md` の順で起票してから実装する。軽微な修正（typo・依存更新・ログ追加）は spec を省略してよい
- **TDD**: Red（失敗するテストの commit）→ Green（実装の commit）→ Refactor の順に進める

## 非自明な設定・制約

### Bun + husky（simple-git-hooks は使わない）

- `bunfig.toml` で `linker = "isolated"`（pnpm 相当。phantom dependency を防ぐ）を採用している
- この linker は `simple-git-hooks` の postinstall script と互換性がない（パス解決に失敗する）
- そのため git hook は **husky v9 + lint-staged + commitlint**。simple-git-hooks に戻さない

### Lint と format は Biome + 型情報だけの ESLint

- format と一般的な lint は Biome（`biome.json`、`bun run check`）。ESLint は typescript-eslint の `recommendedTypeCheckedOnly`（型情報を使うルールだけ）を `.ts` に適用する（`bun run lint`）。理由は [ADR 0001](./docs/adr/0001-biome-with-type-aware-eslint.md)
- **型情報を使わないルールを ESLint に足さない。** Biome とルールが重なる。足したいルールは `biome.json` で有効にする
- `eslint.config.js` は `projectService: true` で、各 workspace の `tsconfig.json` を自動で解決する。lint する `.ts` は、どれかの `tsconfig.json` の `include` に入っている必要がある
- ルールを止める前に、コード側で直せないかを考える。今ある例外は、bun:test の型の都合で `await-thenable` を CLI のテストだけで止めているもの 1 つ

### Turbo の実行単位

- `bun run lint` などは、すべて turbo 経由で各 workspace に委譲される
- root だけを lint するときは `bun run lint:root`

### ランタイムのバージョン

- `.tool-versions`（mise / asdf 互換）を正とする。切り替えは `mise install` / `asdf install`
- Node は LTS の最新に揃える。Cloudflare Workers の実行環境は Node ではない（workerd）ので、Node のバージョンが効くのは手元と CI の wrangler・tsc・ESLint だけ
- `.node-version` は、`.tool-versions` を読まないツールのために、同じバージョンを書いて併置している。上げるときは `.tool-versions`・`.node-version`・`package.json` の `engines` を揃える
- CI は `actions/setup-node` で `.tool-versions` の Node を入れる（ランナーに最初から入っている Node に頼らない）

### 環境変数

- `.env` はローカル専用（gitignore 済み）。`.env.example` を雛形にする
- 機密値は GitHub Actions の secrets に置き、CI が deploy 時に注入する

### 依存は使う workspace に宣言する

- Turborepo の方針どおり、依存はそれを使う workspace の `package.json` に宣言する。root に置くのは、リポジトリを管理するツール（turbo・husky・lint-staged・commitlint・Biome・ESLint と typescript-eslint）だけ（[Managing dependencies](https://turborepo.com/docs/crafting-your-repository/managing-dependencies)）
- `tsc` を呼ぶ workspace は、それぞれ `typescript` を宣言する。root の `typescript` は typescript-eslint の peer dependency のために置いている
- `vitest` は `refrain-worker` に宣言している。**v3 に戻さない**。`@cloudflare/vitest-pool-workers` の peerDependencies が `vitest: ^4.1.0` を要求するため、テストが起動しなくなる

### refrain のその他の制約

- `apps/refrain/worker/worker-configuration.d.ts` は `wrangler types` の生成物だが、typecheck に必要なので**意図して追跡している**。root の `.gitignore` は同名のファイルを無視するので、否定パターンで例外にしてある。再生成は `bun run --filter refrain-worker cf-typegen`
- `refrain-cli` の `build` は macOS 専用のバイナリ（約 60 MB）を作る。CI に `turbo run build` を足すときは `--filter=!refrain-cli` を付ける（今の CI は build を実行しない）
- `worker/vitest.config.ts` が `wrangler.toml` を参照するので、`wrangler.toml` を gitignore に戻すと CI の `bun run test` が起動時に落ちる

## 公開リポジトリとしての注意

- `.env` や機密値をコミットしない。`.gitignore` を信頼する前に、ファイルの中身を確かめる
- refrain の独自ドメインは、ソース・設定・ドキュメントのどこにも書かない。ドキュメントでは `{DOMAIN}` プレースホルダのままにする
  - `apps/refrain/worker/wrangler.toml` は追跡しているが `[[routes]]` を持たない。ルートは deploy 時に `wrangler deploy --routes "$REFRAIN_ROUTE"` で渡す
  - CI では `.github/workflows/deploy-refrain.yml` が `secrets.REFRAIN_ROUTE` から渡す。**`vars` は使わない**（ワークフローのログに平文で出るため）
  - CLI のエンドポイントは、`REFRAIN_ENDPOINT` 環境変数 → `~/.config/refrain/config.json` → 対話プロンプトの順で解決する。コンパイル時の既定値は持たない
  - これは運用上の配慮で、**秘匿性は得られない**（画像の URL を外に貼れば露出する）。アップロードを守っているのは `UPLOAD_TOKEN` だけ
- `docs/plan/`（設計メモ）と `**/docs/report/`（セッションの作業報告）は gitignore している。コミットしない
- `experiments/` は、各ディレクトリの `README.md` だけを追跡する。素材や成果物はコミットしない

## アーカイブ

`archive/` には運用を止めたアプリを当時のまま置いている。workspace・CI・lint・format の対象外で、コードを変更しない（例外は、公開リポジトリに残してはいけない識別子の除去だけ）。ほかのアプリを実装するときの参考や基準にもしない。

## アプリの取り込み

新しいアプリは `git subtree add --prefix=apps/<name> <remote-url> main --squash` で取り込む。取り込み後の手順（devDependencies の昇格・`tsconfig.base.json` への extends・ハードコード値の環境変数化）は README の「新しいアプリを追加する手順」を参照。

## テストランナー

workspace ごとに違う（Workers は Vitest、Bun の CLI は `bun:test`）。対応表と理由は README の「テストツール棲み分け」節を参照。

## Agent skills

### Issue tracker

GitHub Issues（`thanks2music/tony-stark-labs`）を `gh` CLI で扱う。See `docs/agents/issue-tracker.md`.

### Triage labels

デフォルトの 5 ラベル（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）をそのまま使う。See `docs/agents/triage-labels.md`.

### Domain docs

multi-context。root の `GLOSSARY-MAP.md` から `apps/<name>/GLOSSARY.md` を引く。See `docs/agents/domain.md`.
