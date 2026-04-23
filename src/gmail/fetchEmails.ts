import type { gmail_v1 } from "googleapis";
import type { LabelIds } from "./labelManager.js";

/**
 * AddToCalendar ラベルが付いた未処理メールを取得する。
 * CalendarAdded ラベルが既に付いているメールはスキップする（冪等性）。
 */
export async function fetchUnprocessedEmails(
  gmail: gmail_v1.Gmail,
  labelIds: LabelIds,
): Promise<gmail_v1.Schema$Message[]> {
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelIds.addToCalendarId],
    maxResults: 10,
  });

  if (!listRes.data.messages) return [];

  const messages: gmail_v1.Schema$Message[] = [];

  for (const msg of listRes.data.messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    // CalendarAdded ラベルが既にあればスキップ
    if (full.data.labelIds?.includes(labelIds.calendarAddedId)) {
      continue;
    }

    messages.push(full.data);
  }

  return messages;
}

/**
 * メールメッセージからプレーンテキスト本文を抽出する。
 * base64url エンコードされた本文をデコードする。
 */
export function extractPlainTextBody(
  message: gmail_v1.Schema$Message,
): string {
  const payload = message.payload;
  if (!payload) throw new Error("メッセージにpayloadがありません");

  // 単一パートのメッセージ
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // マルチパート — text/plain パートを探索
  if (payload.parts) {
    const textPart = findTextPlainPart(payload.parts);
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
  }

  throw new Error("メッセージからtext/plain本文を取得できませんでした");
}

function findTextPlainPart(
  parts: gmail_v1.Schema$MessagePart[],
): gmail_v1.Schema$MessagePart | undefined {
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      return part;
    }
    // ネストされたマルチパートを再帰的に探索
    if (part.parts) {
      const found = findTextPlainPart(part.parts);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * メールヘッダーから指定した名前の値を取得する。
 */
export function extractHeader(
  message: gmail_v1.Schema$Message,
  name: string,
): string {
  const header = message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? "";
}
