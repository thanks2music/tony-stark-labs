import { ParsedEventSchema, type ParsedEvent } from '../types/event.js';

/**
 * Doorkeeperの申込確認メールからイベント情報を抽出する。
 *
 * メール構造:
 *   {ユーザー名}さん、こんにちは。
 *   「{イベント名}」へのお申し込みありがとうございます。
 *   {YYYY-MM-DD}（{曜日}）{HH:MM} - {HH:MM}
 *   ...
 *   オンライン {URL} で参加
 */
export function parseDoorkeeperEmail(
  subject: string,
  body: string,
  messageId: string,
): ParsedEvent[] {
  const title = extractTitle(body, subject);
  const { startDateTime, durationMinutes } = extractDateTime(body);
  const url = extractUrl(body);

  return [
    ParsedEventSchema.parse({
      title,
      startDateTime,
      durationMinutes,
      url,
      source: 'doorkeeper',
      originalSubject: subject,
      messageId,
    }),
  ];
}

/**
 * 「」内からイベント名を抽出。見つからなければ件名をフォールバック。
 */
function extractTitle(body: string, subject: string): string {
  const match = body.match(/「(.+?)」へのお申し込み/);
  return match?.[1] ?? subject;
}

/**
 * "2026-04-24（金）21:00 - 23:00" 形式から開始日時とdurationを抽出。
 */
function extractDateTime(body: string): {
  startDateTime: string;
  durationMinutes: number;
} {
  const match = body.match(/(\d{4})-(\d{2})-(\d{2})（.）(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);

  if (!match) {
    throw new Error('Doorkeeperメールから日時を抽出できませんでした');
  }

  // 固定キャプチャグループ数の regex なので、match 成功時は全要素が string。
  const [, year, month, day, startHour, startMin, endHour, endMin] = match as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const startDate = new Date(
    `${year}-${month}-${day}T${startHour.padStart(2, '0')}:${startMin}:00+09:00`,
  );

  const startMinutes = parseInt(startHour) * 60 + parseInt(startMin);
  const endMinutes = parseInt(endHour) * 60 + parseInt(endMin);
  const durationMinutes = endMinutes - startMinutes;

  return {
    startDateTime: startDate.toISOString(),
    durationMinutes: durationMinutes > 0 ? durationMinutes : 60,
  };
}

/**
 * "オンライン {URL} で参加" パターンからURLを抽出。
 */
function extractUrl(body: string): string | undefined {
  const match = body.match(/オンライン\s+(https?:\/\/\S+)\s+で参加/);
  return match?.[1];
}
