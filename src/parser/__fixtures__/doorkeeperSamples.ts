export const DOORKEEPER_SAMPLE_1 = {
  subject:
    "【CeeBeeDee】Claude Codeとフロントエンド開発 ──全社員がAIエージェントを活用するUbieの実践事例／鹿野 壮 へのお申し込み",
  body: `Yoshiyuki Itoさん、こんにちは。
「【CeeBeeDee】Claude Codeとフロントエンド開発 ──全社員がAIエージェントを活用するUbieの実践事例／鹿野 壮」へのお申し込みありがとうございます。
2026-04-24（金）21:00 - 23:00
【CeeBeeDee】Claude Codeとフロントエンド開発 ──全社員がAIエージェントを活用するUbieの実践事例／鹿野 壮 CSS Nite
オンライン https://www.youtube.com/watch?v=VQCL3j_DB2w で参加
イベント情報詳細 »
当日の視聴のみ (入場無料)
「無料」のチケットから「アーカイブ視聴を含む」のチケットに切り替えるには、ご自身でキャンセルしてから再度お申し込みください（終演時刻まで）。終演後はSTORES、および、サブスクでもアーカイブを扱っています。

申し込み内容詳細
キャンセル
このメールには、 Yoshiyuki Itoさんだけが利用できる特定のリンクが含まれていますので、他者へのメール転送は控えてください。
このイベントの主催者は「CSS Nite」です。 主催者へのお問い合わせ。`,
  expected: {
    title:
      "【CeeBeeDee】Claude Codeとフロントエンド開発 ──全社員がAIエージェントを活用するUbieの実践事例／鹿野 壮",
    startDateTime: "2026-04-24T12:00:00.000Z", // 21:00 JST = 12:00 UTC
    durationMinutes: 120, // 21:00 - 23:00
    url: "https://www.youtube.com/watch?v=VQCL3j_DB2w",
  },
};

export const DOORKEEPER_SAMPLE_2_OFFLINE = {
  subject: "TypeScript勉強会 へのお申し込み",
  body: `テストユーザーさん、こんにちは。
「TypeScript勉強会」へのお申し込みありがとうございます。
2026-05-10（土）14:00 - 17:00
TypeScript勉強会 Tech Community
東京都渋谷区xxx
イベント情報詳細 »
一般参加 (1000円)

申し込み内容詳細
キャンセル
このメールには、 テストユーザーさんだけが利用できる特定のリンクが含まれていますので、他者へのメール転送は控えてください。
このイベントの主催者は「Tech Community」です。 主催者へのお問い合わせ。`,
  expected: {
    title: "TypeScript勉強会",
    startDateTime: "2026-05-10T05:00:00.000Z", // 14:00 JST = 05:00 UTC
    durationMinutes: 180, // 14:00 - 17:00
    url: undefined, // オフラインイベント、URLなし
  },
};
