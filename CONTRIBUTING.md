# CONTRIBUTING

本リポジトリは [@thanks2music](https://github.com/thanks2music) の個人 monorepo であり、`apps/` 配下に各ツールを束ねて管理する。共通のツールチェーン・CI・品質ゲートを通すことを目的とする。

## 開発原則

- **TDD (Test-Driven Development)**: Red → Green → Refactor のサイクルで進める
- **SDD (Spec-Driven Development)**: 新機能は `specs/` に仕様を切ってから実装する
- **Progress over perfection**: 完璧よりも継続を優先する

## 必須ツール

| ツール       | バージョン                     | 備考                                  |
| ------------ | ------------------------------ | ------------------------------------- |
| Bun          | `>=1.3` (cf. `.tool-versions`) | Package manager / ランタイム          |
| Node.js      | `>=22` (cf. `.tool-versions`)  | GCF 互換のため 22 以上                |
| mise or asdf | 最新                           | `.tool-versions` でバージョンを揃える |

```bash
# 初回セットアップ
mise install   # または: asdf install
bun install
```

## コマンド一覧

```bash
# 全 workspace の lint / typecheck / test を Turbo 経由で実行
bun run lint
bun run typecheck
bun run test
bun run build

# 特定アプリのみ
bun run --filter <workspace> <script>
# 例:
bun run --filter mail-to-gcal test
bun run --filter refrain-worker dev

# Turbo フィルタ（依存も含めて解決される）
turbo run test --filter=mail-to-gcal
turbo run build --filter=...[HEAD^1]   # 変更アプリのみ

# フォーマット
bun run format           # 適用
bun run format:check     # チェックのみ
```

## ディレクトリ構造

```
tony-stark-labs/
├── apps/              # 各アプリ
│   ├── refrain/       # Gyazo ライク画像アップロード（CF Workers + CLI）
│   └── mail-to-gcal/  # Gmail → Google Calendar 自動登録（GCF）
├── packages/          # 共有ライブラリ（初期は空）
├── tools/             # 開発スクリプト
├── specs/             # SDD 成果物（NNN-<slug>/spec.md, plan.md, tasks.md）
├── .specify/          # SpecKit CLI テンプレート
└── .github/workflows/ # CI / デプロイ
```

## テストツール棲み分け

| Workspace             | Runner                                         | 理由                                                 |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `apps/refrain/worker` | **Vitest** + `@cloudflare/vitest-pool-workers` | Workers ランタイムの再現は Vitest 専用 pool が必須   |
| `apps/refrain/cli`    | **bun:test**                                   | `Bun.spawn` / `bun build --compile` とランタイム一致 |
| `apps/mail-to-gcal`   | **Vitest**                                     | GCF Node22 本番ランタイムと整合                      |
| `packages/*`          | **Vitest** 既定                                | 両ランタイムから import されうる標準寄り             |

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

### AI 生成コミットの扱い

CEO の運用ルールに従い、Claude や他の AI が生成したコミットに `Co-Authored-By:` 署名は**付与しない**。コミットメッセージや PR 本文は AI が提案するが、実際の commit / push / PR 作成は人間が行う。

## pre-commit

- `husky` + `lint-staged` でステージ済みファイルに ESLint + Prettier を自動適用（`.husky/pre-commit`）
- `commit-msg` hook で commitlint が走る（`.husky/commit-msg`）

初回のセットアップは `bun install` 時に `prepare` script が `husky` を初期化する。手動で `bun run prepare` を実行してもよい。

## CI

- `.github/workflows/ci.yml`: PR と main push で `lint` / `format:check` / `typecheck` / `test` を実行
- アプリごとの `deploy-*.yml` は各アプリ取り込み時に追加する

## SpecKit

`specs/NNN-<slug>/` に `spec.md` / `plan.md` / `tasks.md` を配置する。`.specify/` に SpecKit CLI のテンプレートを vendored で配置する（Phase 0 時点では設置見送り、必要になったら追加）。

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
