import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type { calendar_v3 } from 'googleapis';
import { getCalendarClient } from './client.js';
import { loadConfig } from '../config.js';
import { SOURCE_LABELS, type ParsedEvent } from '../types/event.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * パース済みイベント情報からGoogleカレンダーにイベントを作成する。
 * 作成されたイベントのIDを返す。
 */
export async function createCalendarEvent(event: ParsedEvent): Promise<string> {
  const calendar = getCalendarClient();

  const startDt = dayjs(event.startDateTime).tz('Asia/Tokyo');
  const endDt = startDt.add(event.durationMinutes, 'minute');

  const description = event.url
    ? `視聴URL: ${event.url}\n\n元メール: ${event.originalSubject}`
    : `元メール: ${event.originalSubject}`;

  const requestBody: calendar_v3.Schema$Event = {
    summary: `[${SOURCE_LABELS[event.source]}] ${event.title}`,
    start: {
      dateTime: startDt.format(),
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: endDt.format(),
      timeZone: 'Asia/Tokyo',
    },
    description,
  };

  const res = await calendar.events.insert({
    calendarId: loadConfig().GOOGLE_CALENDAR_ID,
    requestBody,
  });

  console.log(`カレンダーイベント作成完了: ${res.data.id} — ${res.data.htmlLink}`);

  return res.data.id!;
}

/**
 * 同じタイトル・同じ開始時刻のイベントが既に存在するか確認する（重複防止）。
 */
export async function eventExists(event: ParsedEvent): Promise<boolean> {
  const calendar = getCalendarClient();

  const startDt = dayjs(event.startDateTime);
  const res = await calendar.events.list({
    calendarId: loadConfig().GOOGLE_CALENDAR_ID,
    timeMin: startDt.subtract(1, 'minute').toISOString(),
    timeMax: startDt.add(1, 'minute').toISOString(),
    q: event.title,
    maxResults: 5,
  });

  return (res.data.items?.length ?? 0) > 0;
}
