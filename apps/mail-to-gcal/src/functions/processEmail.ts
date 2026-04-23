import * as ff from '@google-cloud/functions-framework';
import type { CloudEventV1 } from 'cloudevents';
import { getGmailClient } from '../gmail/client.js';
import { getLabelIds, swapLabels } from '../gmail/labelManager.js';
import {
  fetchUnprocessedEmails,
  extractPlainTextBody,
  extractHeader,
} from '../gmail/fetchEmails.js';
import { parseEmail } from '../parser/index.js';
import { createCalendarEvent, eventExists } from '../calendar/createEvent.js';

interface PubSubData {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

ff.cloudEvent<PubSubData>('processEmail', async (ce: CloudEventV1<PubSubData>) => {
  // Pub/Sub メッセージをログ出力（デバッグ用）
  const pubsubData = ce.data?.message?.data;
  if (pubsubData) {
    const decoded: unknown = JSON.parse(Buffer.from(pubsubData, 'base64').toString('utf-8'));
    console.log('Gmail通知受信:', decoded);
  }

  const gmail = getGmailClient();
  const labelIds = await getLabelIds(gmail);

  // ラベルベースで未処理メールを取得
  const messages = await fetchUnprocessedEmails(gmail, labelIds);
  console.log(`未処理メール: ${messages.length}件`);

  for (const message of messages) {
    const messageId = message.id!;

    try {
      const from = extractHeader(message, 'From');
      const subject = extractHeader(message, 'Subject');
      const body = extractPlainTextBody(message);

      // パース（未対応の送信元はスキップ）
      const parsedEvents = await parseEmail(from, subject, body, messageId);
      if (!parsedEvents || parsedEvents.length === 0) {
        console.warn(`未対応の送信元: ${from} — メッセージ ${messageId} をスキップ`);
        continue;
      }

      // 各イベントを処理
      for (const parsed of parsedEvents) {
        // カレンダー重複チェック
        if (await eventExists(parsed)) {
          console.log(`イベント既存: "${parsed.title}" — スキップ`);
          continue;
        }

        // カレンダーイベント作成
        await createCalendarEvent(parsed);
      }

      // ラベル入替: AddToCalendar → CalendarAdded（1メールにつき1回）
      await swapLabels(gmail, messageId, labelIds);
      console.log(`処理完了: メッセージ ${messageId}`);
    } catch (err) {
      // 個別メールの失敗は他のメールの処理に影響させない
      // AddToCalendar ラベルを維持し、次回リトライ対象にする
      console.error(`メッセージ ${messageId} の処理に失敗:`, err);
    }
  }
});
