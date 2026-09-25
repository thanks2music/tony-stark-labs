# Tony Stark Labs

[@thanks2music (Yoshiyuki Ito)](https://github.com/thanks2music) の個人開発ツールを束ねた polyglot monorepo である。各アプリは `apps/` 配下に独立した workspace として存在し、ツールチェーン（ランタイム・Lint・Format・Test・CI）を共有する。ホスティングはアプリごとに最適化する方針である（Vercel への集約はしない）。

## 目次

- [開発原則](#開発原則)
- [技術スタック](#技術スタック)
- [ディレクトリ構造](#ディレクトリ構造)
- [初回セットアップ](#初回セットアップ)
- [開発コマンド](#開発コマンド)
- [開発フロー (TDD + SDD)](#開発フロー-tdd--sdd)
- [テストツール棲み分け](#テストツール棲み分け)
- [Commit Convention](#commit-convention)
- [pre-commit / CI](#pre-commit--ci)
- [アプリ一覧と状態](#アプリ一覧と状態)
- [新しいアプリを追加する手順](#新しいアプリを追加する手順)
- [ライセンス](#ライセンス)

## 開発原則

- **TDD (Test-Driven Development)**: Red → Green → Refactor のサイクルで進める
- **SDD (Spec-Driven Development)**: 新機能は `specs/` に仕様を切ってから実装する
- **Progress over perfection**: 完璧よりも継続を優先する

## 技術スタック

| 層                       | 採用                                           |
| ------------------------ | ---------------------------------------------- |
| Package Manager          | Bun (`packageManager: bun@1.3.2`)              |
| タスクランナー           | Turborepo 2.x                                  |
| ランタイム               | Bun 1.3.2 / Node.js 24.14.0                    |
| 言語                     | TypeScript 6                                   |
| Lint / Format            | ESLint 9 (flat config) / Prettier 3            |
| Test                     | Vitest（Workers / Node）・bun:test（Bun 専用） |
| Git Hook                 | husky + lint-staged + commitlint               |
| ランタイムバージョン管理 | `.tool-versions` (mise / asdf)                 |

## ディレクトリ構造

```
tony-stark-labs/
├── apps/                    # 各アプリ
│   ├── refrain/             # CF Workers + R2 + macOS CLI 画像アップロードシステム
│   │   ├── worker/          # workspace: refrain-worker (Cloudflare Workers, Vitest)
│   │   └── cli/             # workspace: refrain-cli (Bun compiled binary, bun:test)
│   └── mail-to-gcal/        # Gmail → Google Calendar 自動登録 (GCF 2nd gen, Vitest)
├── packages/                # 共有ライブラリ（初期は空）
├── tools/                   # 開発スクリプト
├── specs/                   # SDD 成果物 (NNN-<slug>/spec.md, plan.md, tasks.md)
├── .specify/                # SpecKit CLI テンプレート（必要時に配置）
├── .github/workflows/       # CI / デプロイ
├── package.json             # workspaces, packageManager, scripts
├── turbo.json               # task pipeline
├── tsconfig.base.json       # strict TS ベース設定
├── eslint.config.js         # flat config
├── .prettierrc / .prettierignore
└── bunfig.toml              # linker = "isolated"
```

## 初回セットアップ

| ツール       | バージョン                     | 備考                                  |
| ------------ | ------------------------------ | ------------------------------------- |
| Bun          | `>=1.3` (cf. `.tool-versions`) | Package manager / ランタイム          |
| Node.js      | `>=22` (cf. `.tool-versions`)  | GCF 互換のため 22 以上                |
| mise or asdf | 最新                           | `.tool-versions` でバージョンを揃える |

```bash
# ランタイムバージョンを揃える
asdf install            # または: mise install

# 依存解決と husky hook セットアップ
bun install
```

## 開発コマンド

```bash
# 全 workspace を Turbo 経由で一括実行
bun run lint            # turbo run lint
bun run typecheck       # turbo run typecheck
bun run test            # turbo run test
bun run build           # turbo run build
bun run format          # prettier --write .
bun run format:check    # prettier --check .

# 特定 workspace のみ
bun run --filter <name> <script>
# 例:
bun run --filter mail-to-gcal test
bun run --filter refrain-worker dev

# Turbo フィルタ（依存も含めて解決される）
turbo run test --filter=mail-to-gcal
turbo run build --filter=...[HEAD^1]   # 変更 workspace とその依存のみ
```

## 開発フロー (TDD + SDD)

### 1. Spec を書く

新機能は `specs/NNN-<slug>/spec.md` に以下を記載する:

- 目的（なぜ必要か）
- ユーザーストーリー / 受け入れ条件
- スコープ外の項目
- 影響範囲（どのアプリ / パッケージ）

軽微な fix（typo、依存更新、ログ追加など）は spec を省略してよい。

### 2. Plan を書く

`specs/NNN-<slug>/plan.md` に実装方針を書く:

- 変更対象ファイル
- テスト戦略
- トレードオフと選択根拠

### 3. Tasks に分解

`specs/NNN-<slug>/tasks.md` に具体的な作業を列挙する。

### 4. Red: 失敗テストを書く

機能に対応する失敗するテストを書き、コミットする。

### 5. Green: 実装する

テストが通る最小の実装を書き、コミットする。

### 6. Refactor

機能を保ちつつコードを整理する。

### SpecKit

`specs/NNN-<slug>/` に `spec.md` / `plan.md` / `tasks.md` を配置する。`.specify/` に SpecKit CLI のテンプレートを vendored で配置する（Phase 0 時点では設置見送り、必要になったら追加）。

## テストツール棲み分け

| Workspace             | Runner                                         | 理由                                                 |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `apps/refrain/worker` | **Vitest** + `@cloudflare/vitest-pool-workers` | Workers ランタイムの再現は Vitest 専用 pool が必須   |
| `apps/refrain/cli`    | **bun:test**                                   | `Bun.spawn` / `bun build --compile` とランタイム一致 |
| `apps/mail-to-gcal`   | **Vitest**                                     | GCF Node22 本番ランタイムと整合                      |
| `packages/*`          | **Vitest** 既定                                | 両ランタイムから import されうる標準寄り             |

Vitest は root の devDependencies に **v4** で一本化している。`@cloudflare/vitest-pool-workers` の peerDependencies が `vitest: ^4.1.0` を要求するため、v3 へ戻すと `refrain-worker` のテストが起動しない。

## Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/) に従う（commitlint で自動検証）。

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**:

| type       | 用途                               |
| ---------- | ---------------------------------- |
| `feat`     | 新機能                             |
| `fix`      | バグ修正                           |
| `docs`     | ドキュメントのみ                   |
| `style`    | コードスタイル（機能に影響しない） |
| `refactor` | リファクタ（機能・テスト変更なし） |
| `test`     | テスト追加・修正                   |
| `chore`    | ビルド・依存・設定                 |
| `ci`       | CI 設定                            |
| `perf`     | パフォーマンス改善                 |

**scope** の例: `refrain`, `mail-to-gcal`, `root`, `ci`, `deps`

**subject の大文字小文字**: commitlint のデフォルト設定により、subject は sentence-case / start-case / pascal-case / upper-case を禁止する。文頭は lowercase で開始し、proper noun（`Bun`, `Turborepo` など）は中間で大文字のまま使用できる。

### AI 生成コミットの扱い

CEO の運用ルールに従い、Claude や他の AI が生成したコミットに `Co-Authored-By:` 署名は**付与しない**。コミットメッセージや PR 本文は AI が提案するが、実際の commit / push / PR 作成は人間が行う。

## pre-commit / CI

### pre-commit

- `husky` + `lint-staged` でステージ済みファイルに ESLint + Prettier を自動適用（`.husky/pre-commit`）
- `commit-msg` hook で commitlint が走る（`.husky/commit-msg`）

初回のセットアップは `bun install` 時に `prepare` script が `husky` を初期化する。手動で `bun run prepare` を実行してもよい。

### CI

- `.github/workflows/ci.yml`: PR と main push で `lint` / `format:check` / `typecheck` / `test` を実行
- アプリごとの `deploy-*.yml` は各アプリ取り込み時に追加する

## アプリ一覧と状態

| アプリ           | 状態                | 技術                                      | ホスティング            |
| ---------------- | ------------------- | ----------------------------------------- | ----------------------- |
| `refrain`        | 取り込み済み        | Bun + CF Workers + R2 + macOS CLI         | Cloudflare Workers + R2 |
| `mail-to-gcal`   | 取り込み済み        | Node.js 22 + functions-framework + Vitest | Google Cloud Functions  |
| `internal-tools` | Phase 3（汎用化後） | 未定                                      | 未定                    |

`refrain` は `refrain-worker` / `refrain-cli` の 2 workspace に分かれる。詳細は [apps/refrain/README.md](./apps/refrain/README.md)。

## 新しいアプリを追加する手順

1. `specs/NNN-<slug>/` で SDD ドキュメントを起票
2. 既存独立リポジトリから取り込む場合:

   ```bash
   git subtree add --prefix=apps/<name> <remote-url> main --squash
   ```

3. `apps/<name>/package.json` から devDependencies を root に昇格
4. `apps/<name>/tsconfig.json` を `extends: "../../tsconfig.base.json"` に
5. ハードコード値があれば環境変数化（`src/config.ts` + Zod）
6. `bun install` で lockfile 再生成
7. `bun run lint typecheck test` がパスすることを確認
8. 必要なら `.github/workflows/deploy-<name>.yml` を追加

## ライセンス

個人リポジトリのため未設定。OSS として公開する部分は別途明示する。
