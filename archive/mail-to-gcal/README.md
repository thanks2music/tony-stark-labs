# Mail to Google Calendar

> [!WARNING]
> **アーカイブ済み（運用停止）。** このアプリはもう使っておらず、tony-stark-labs の workspace・CI・lint の対象から外している。
> AI エージェントは、このディレクトリのコードを変更しないこと。また、ほかのアプリを実装するときの参考や基準にしないこと。
> 当時のまま残している記録で、依存のバージョンや設定はリポジトリの現在の方針（AGENTS.md）と食い違っている。
> アーカイブ時に変えたのは `package.json` の `deploy:process` だけで、カレンダー ID の直書きを環境変数 `GOOGLE_CALENDAR_ID` に置き換えた（値は `…@group.calendar.google.com` まで含めた ID 全体）。

## 既知の問題（運用停止時点で未修正）

2026-11 のコードレビューで見つかったが、運用を止めたため直していない。

- 対象外の送信元や解析に失敗したメールに `AddToCalendar` ラベルが残り続け、毎回の通知で再処理される。取得件数が 10 件なので、それが 10 件たまると新しいメールが処理されない
- AI が時差のない日時（`2026-04-07T12:00:00`）を返すと、GCF の UTC として解釈され、予定が 9 時間ずれる
- AI の応答で `url` が `null` などのとき、そのメールの予定がすべて登録されない
- Doorkeeper の日をまたぐイベント（22:00〜01:00）の長さが 60 分になる

本リポジトリでは、Connpassや、EventHub、Findyなどで開催される「オンライン勉強会」の予定を、
申し込んだ確認メールから、日時を抽出して、自身のGoogleカレンダーに追加する機能を開発する。

## 対応状況

| サービス | 対応状況                       |
| -------- | ------------------------------ |
| Findy    | 対応予定（ミニマム実装の対象） |
| Connpass | 未対応                         |
| EventHub | 未対応                         |

## システム概要

Gmail API の `watch()` を使ったイベント駆動アーキテクチャを採用する。
ポーリングではなく、対象メールが届いた時だけ処理を実行することで、無駄な起動を抑える。

### アーキテクチャ図

```
[Gmail] メール受信
  │
  │  Gmailフィルタにより `AddToCalendar` ラベルを自動付与
  │  （from:support@findy-code.io など、サービスごとにフィルタを設定）
  │
  ▼
[Gmail API watch()] `AddToCalendar` ラベルの変更を監視
  │
  ▼
[Cloud Pub/Sub] トピックに通知を発行
  │
  ▼
[Cloud Functions (2nd gen)] Pub/Sub トリガーで起動
  ├─ Gmail API: historyId をもとに該当メールを取得
  ├─ メール本文パース: イベント名・開催日時・視聴URLを抽出
  ├─ Google Calendar API: 予定を作成
  └─ Gmail API: `AddToCalendar` → `CalendarAdded` にラベルを変更
```

### Gmailラベル設計

| ラベル名        | 用途                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `AddToCalendar` | Gmailフィルタにより自動付与。このラベルが付いたメールが `watch()` のトリガー対象 |
| `CalendarAdded` | Cloud Functions が処理完了後に付与。重複登録の防止に使用                         |

処理の流れ: メール受信 → `AddToCalendar` 自動付与 → `watch()` が検知 → 処理 → `AddToCalendar` を除去し `CalendarAdded` を付与

### Gmailフィルタ設定（ユーザー側の事前準備）

Gmailの設定画面で以下のフィルタを作成する。将来サービスを追加する際は、フィルタを追加するだけでよい。

| サービス | フィルタ条件                                                    | アクション                   |
| -------- | --------------------------------------------------------------- | ---------------------------- |
| Findy    | `from:support@findy-code.io subject:イベントに関するメッセージ` | `AddToCalendar` ラベルを付与 |
| Connpass | （将来追加予定）                                                | `AddToCalendar` ラベルを付与 |
| EventHub | （将来追加予定）                                                | `AddToCalendar` ラベルを付与 |

### watch() の再登録

Gmail API の `watch()` は最大7日間で失効するため、Cloud Scheduler で1日1回 `watch()` を再登録する専用の Cloud Functions を呼び出す。

```
[Cloud Scheduler] 1日1回（例: 毎日 03:00 JST）
  → [Cloud Functions] renewWatch: Gmail API watch() を再登録
```

### 処理フロー詳細

1. **Cloud Pub/Sub** が Gmail API `watch()` から通知を受信（`AddToCalendar` ラベルの変更時のみ）
2. **Cloud Functions** が Pub/Sub トリガーで起動し、`historyId` をもとに Gmail API で該当メールを取得
3. メール送信元を判定し、対応するパーサーを選択（現時点では Findy のみ）
4. メール本文を正規表現でパースし、イベント名・開催日時・視聴URLを抽出
5. **Google Calendar API** で予定を作成（タイトルに `[Findy]` プレフィックス付与）
6. 処理済みメールの `AddToCalendar` ラベルを除去し、`CalendarAdded` ラベルを付与

## Findyメールのフォーマット

Findyからのイベント申し込み確認メールは以下のような構造を持つ。

- **送信元**: `support@findy-code.io`
- **件名**: `イベントに関するメッセージ「{イベント名}」【Findy-ファインディ】`

本文の構造:

```
■ イベント名
{イベント名}

■ 開催日時
{YYYY年MM月DD日 HH:mm〜}

■ 視聴用URL
{URL}

・{補足情報1}
・{補足情報2}
```

### 抽出対象

| 項目       | 抽出方法                                           |
| ---------- | -------------------------------------------------- |
| イベント名 | 「■ イベント名」の次行                             |
| 開催日時   | 「■ 開催日時」の次行（正規表現で年月日時分を抽出） |
| 視聴用URL  | 「■ 視聴用URL」の次行                              |
| 補足情報   | 「・」で始まる行を収集                             |

## Googleカレンダー登録内容

```
タイトル: [Findy] {イベント名}
開始時刻: メールから抽出した日時（JST）
終了時刻: 開始時刻 + 1時間（デフォルト。メールに終了時刻の記載がないため）
説明:
  視聴URL: {URL}
  {補足情報}
```

## 技術スタック

| 項目                 | 選定                                                     | 理由                                                               |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| ランタイム           | Node.js 22 + TypeScript                                  | 開発者の得意技術                                                   |
| 実行環境             | Cloud Functions (2nd gen)                                | Cloud Runベース。Pub/Subトリガーに対応                             |
| メイン トリガー      | Cloud Pub/Sub                                            | Gmail API `watch()` からの通知で起動。イベント駆動                 |
| watch再登録          | Cloud Scheduler（1日1回）                                | `watch()` の7日間失効対策                                          |
| Gmail操作            | googleapis (`gmail.users.messages`, `gmail.users.watch`) | Google公式SDK                                                      |
| Calendar操作         | googleapis (`calendar.events.insert`)                    | Google公式SDK                                                      |
| 認証                 | OAuth 2.0 + Refresh Token                                | 個人Gmailアカウントのためサービスアカウント不可                    |
| メールパース         | 正規表現                                                 | Findyのメールは構造が明確なので十分                                |
| 日時パース           | dayjs                                                    | 軽量で日本語日時のパースに対応しやすい                             |
| バリデーション       | Zod                                                      | パース結果の型安全な検証                                           |
| 状態管理             | Gmailラベル                                              | `AddToCalendar`（未処理）→ `CalendarAdded`（処理済み）。別途DB不要 |
| パッケージマネージャ | Bun                                                      | 開発者の普段の環境に合わせて                                       |

## 認証について

個人のGmailアカウントに対してGmail API / Calendar APIを使うため、サービスアカウントは使用できない（Google Workspaceのドメイン全体委任が必要なため）。OAuth 2.0 のフローで初回認証を行い、取得した Refresh Token を Secret Manager に保存する。

## GCPリソース構成

| リソース                                     | 用途                                            |
| -------------------------------------------- | ----------------------------------------------- |
| Cloud Functions `processEmail`               | Pub/Sub トリガー。メールパース → カレンダー登録 |
| Cloud Functions `renewWatch`                 | HTTP トリガー。Gmail API `watch()` の再登録     |
| Cloud Pub/Sub トピック `gmail-notifications` | Gmail API `watch()` の通知先                    |
| Cloud Scheduler ジョブ `renew-gmail-watch`   | 1日1回 `renewWatch` を呼び出し                  |
| Secret Manager                               | OAuth Refresh Token の保管                      |

## プロジェクト構成

```
mail-to-google-calendar/
├── src/
│   ├── functions/
│   │   ├── processEmail.ts    # Pub/Subトリガー: メール処理のエントリーポイント
│   │   └── renewWatch.ts      # HTTPトリガー: watch()再登録のエントリーポイント
│   ├── gmail/
│   │   ├── client.ts          # Gmail API クライアント初期化
│   │   ├── fetchEmails.ts     # historyIdをもとにメール取得
│   │   ├── watchManager.ts    # watch()の登録・再登録
│   │   └── labelManager.ts    # ラベル管理（AddToCalendar → CalendarAdded）
│   ├── parser/
│   │   ├── index.ts           # パーサー振り分け（送信元で判定）
│   │   └── findyParser.ts     # Findyメール本文パーサー
│   ├── calendar/
│   │   ├── client.ts          # Calendar API クライアント初期化
│   │   └── createEvent.ts     # カレンダーイベント作成
│   ├── auth/
│   │   └── oauth.ts           # OAuth認証ヘルパー（Secret Managerからトークン取得）
│   └── types/
│       └── event.ts           # Zod スキーマ & 型定義
├── scripts/
│   └── getRefreshToken.ts     # 初回OAuth認証用スクリプト（ローカル実行）
├── package.json
├── tsconfig.json
└── .env.example
```

## 開発ワークフロー（git worktree）

本プロジェクトでは、Claude Code の worktree 機能を使って、mainブランチから独立した作業ディレクトリで開発を行う。

### 新しいworktreeの作成

```bash
# メインリポジトリのルートで実行
cd /Users/yoshi/work/dev/my-projects/mail-to-google-calendar

# ブランチ + worktreeを同時に作成
git worktree add .claude/worktrees/<作業名> -b <ブランチ名>

# 例:
git worktree add .claude/worktrees/add-connpass-parser -b feature/add-connpass-parser

# worktreeに移動
cd .claude/worktrees/add-connpass-parser

# 依存関係インストール（worktree毎に必要）
bun install
```

### 作業中

```bash
# worktreeディレクトリで通常通り開発
bun run test       # テスト実行
bun run build      # ビルド

# コミットも通常通り
git add <files>
git commit -m "feat: ..."
```

### mainへのマージとworktree削除

```bash
# 1. メインリポジトリに戻る
cd /Users/yoshi/work/dev/my-projects/mail-to-google-calendar

# 2. mainブランチでマージ
git merge <ブランチ名>

# 3. worktreeを削除
git worktree remove .claude/worktrees/<作業名>

# 4. ブランチも削除（-d はマージ済みのみ削除するので安全）
git branch -d <ブランチ名>
```

### 注意事項

- `node_modules` はworktree間で共有されないため、新しいworktree作成後は必ず `bun install` を実行する
- `.claude/worktrees/` は `.gitignore` に含まれており、git追跡対象外
- worktreeの一覧は `git worktree list` で確認できる

## 実装ステップ

1. **GCPプロジェクト設定**: Gmail API / Calendar API / Pub/Sub を有効化、OAuth同意画面設定
2. **OAuth認証**: `scripts/getRefreshToken.ts` で初回認証を行い、Refresh Tokenを取得 → Secret Managerに保存
3. **Pub/Subトピック作成**: `gmail-notifications` トピックを作成し、`gmail-api-push@system.gserviceaccount.com` にパブリッシュ権限を付与
4. **Gmailフィルタ設定**: `from:support@findy-code.io` のメールに `AddToCalendar` ラベルを自動付与するフィルタを作成
5. **watch()登録**: Gmail API `watch()` で `AddToCalendar` ラベルの変更を監視開始
6. **メール取得**: historyIdをもとにGmail APIで該当メールを取得
7. **メールパース**: 正規表現でイベント名・日時・URLを抽出し、Zodでバリデーション
8. **カレンダー登録**: Calendar APIでイベント作成
9. **ラベル変更**: 処理済みメールの `AddToCalendar` を除去し `CalendarAdded` を付与
10. **Cloud Functionsデプロイ**: `processEmail`（Pub/Subトリガー）と `renewWatch`（HTTPトリガー）をデプロイ
11. **Cloud Scheduler設定**: 1日1回 `renewWatch` を呼び出すジョブを作成
