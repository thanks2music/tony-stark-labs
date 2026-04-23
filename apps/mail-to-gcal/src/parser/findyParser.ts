import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { ParsedEventSchema, type ParsedEvent } from '../types/event.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

/**
 * Findyのイベント申込確認メールをパースし、イベント情報を抽出する。
 *
 * メール本文の構造:
 *   ■ イベント名
 *   {イベント名}
 *   ■ 開催日時
 *   {YYYY}年{MM}月{DD}日 {HH}:{mm}〜
 *   ■ 視聴用URL
 *   {URL}
 */
export function parseFindyEmail(subject: string, body: string, messageId: string): ParsedEvent[] {
  const title = extractTitle(body, subject);
  const startDateTime = extractDateTime(body);
  const url = extractUrl(body);

  return [
    ParsedEventSchema.parse({
      title,
      startDateTime,
      durationMinutes: 60,
      url,
      source: 'findy',
      originalSubject: subject,
      messageId,
    }),
  ];
}

function extractTitle(body: string, subject: string): string {
  // 本文の「■ イベント名」セクションから抽出を優先
  const bodyMatch = body.match(/■\s*イベント名\s*\n(.+)/);
  if (bodyMatch?.[1]?.trim()) {
    return bodyMatch[1].trim();
  }

  // フォールバック: 件名から「」内のテキストを抽出
  const subjectMatch = subject.match(/「(.+?)」/);
  if (subjectMatch?.[1]) {
    return subjectMatch[1];
  }

  throw new Error('イベント名を抽出できませんでした');
}

function extractDateTime(body: string): string {
  const section = body.match(/■\s*開催日時\s*\n(.+)/);
  if (!section?.[1]) {
    throw new Error('開催日時セクションが見つかりませんでした');
  }

  const dateMatch = section[1].match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
  if (!dateMatch) {
    throw new Error('開催日時を抽出できませんでした');
  }

  const [, year, month, day, hour, minute] = dateMatch;
  const dateStr = `${year}年${month}月${day}日 ${hour}:${minute}`;
  const parsed = dayjs.tz(dateStr, 'YYYY年M月D日 H:mm', 'Asia/Tokyo');

  if (!parsed.isValid()) {
    throw new Error(`無効な日時です: ${dateStr}`);
  }

  return parsed.toISOString();
}

function extractUrl(body: string): string | undefined {
  const idx = body.search(/■\s*視聴用URL/);
  if (idx < 0) return undefined;
  return body.slice(idx).match(/https?:\/\/\S+/)?.[0];
}
