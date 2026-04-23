# Tony Stark Labs

[@thanks2music (Yoshiyuki Ito)](https://github.com/thanks2music) の個人開発ツールを束ねた polyglot monorepo である。各アプリは `apps/` 配下に独立した workspace として存在し、ツールチェーン（ランタイム・Lint・Format・Test・CI）を共有する。ホスティングはアプリごとに最適化する方針である（Vercel への集約はしない）。

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
├── apps/                    # 各アプリ（Phase 1 以降で取り込み）
│   ├── refrain/             # CF Workers + R2 + macOS CLI 画像アップロードシステム
│   │   ├── worker/          # Cloudflare Workers (Vitest)
│   │   └── cli/             # Bun compiled binary (bun:test)
│   └── mail-to-gcal/        # Gmail → Google Calendar 自動登録 (GCF 2nd gen, Vitest)
├── packages/                # 共有ライブラリ（初期は空）
├── tools/                   # 開発スクリプト
├── specs/                   # SDD 成果物 (NNN-<slug>/spec.md, plan.md, tasks.md)
├── .github/workflows/       # CI / デプロイ
├── package.json             # workspaces, packageManager, scripts
├── turbo.json               # task pipeline
├── tsconfig.base.json       # strict TS ベース設定
├── eslint.config.js         # flat config
├── .prettierrc / .prettierignore
├── bunfig.toml              # linker = "isolated"
└── CONTRIBUTING.md          # 開発フロー・コミット規約
```

## 必須ツール

```bash
# asdf または mise でランタイムバージョンを揃える
asdf install            # .tool-versions に従い bun 1.3.2 / nodejs 24.14.0 を導入
bun install             # 依存解決と husky hook セットアップ
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

# Turbo フィルタ（変更検出・依存解決）
turbo run test --filter=mail-to-gcal
turbo run build --filter=...[HEAD^1]   # 変更 workspace とその依存のみ
```

## アプリ一覧と状態

| アプリ           | 状態                 | 技術                                      | ホスティング            |
| ---------------- | -------------------- | ----------------------------------------- | ----------------------- |
| `refrain`        | Phase 2 取り込み予定 | Bun + CF Workers + R2 + macOS CLI         | Cloudflare Workers + R2 |
| `mail-to-gcal`   | Phase 1 取り込み予定 | Node.js 22 + functions-framework + Vitest | Google Cloud Functions  |
| `internal-tools` | Phase 3（汎用化後）  | 未定                                      | 未定                    |

## ドキュメント

- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発フロー、TDD / SDD 運用、コミット規約

## ライセンス

個人リポジトリのため未設定。OSS として公開する部分は別途明示する。
