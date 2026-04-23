import type { gmail_v1 } from "googleapis";

const LABEL_ADD_TO_CALENDAR = "AddToCalendar";
const LABEL_CALENDAR_ADDED = "CalendarAdded";

export interface LabelIds {
  addToCalendarId: string;
  calendarAddedId: string;
}

let cachedLabelIds: LabelIds | null = null;

/**
 * AddToCalendar / CalendarAdded ラベルのIDを取得する。
 * 存在しない場合は自動作成する。
 */
export async function getLabelIds(gmail: gmail_v1.Gmail): Promise<LabelIds> {
  if (cachedLabelIds) return cachedLabelIds;

  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];

  let addToCalendarId = labels.find(
    (l) => l.name === LABEL_ADD_TO_CALENDAR,
  )?.id;
  let calendarAddedId = labels.find(
    (l) => l.name === LABEL_CALENDAR_ADDED,
  )?.id;

  if (!addToCalendarId) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: LABEL_ADD_TO_CALENDAR,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    addToCalendarId = created.data.id!;
    console.log(`ラベル "${LABEL_ADD_TO_CALENDAR}" を作成しました: ${addToCalendarId}`);
  }

  if (!calendarAddedId) {
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: LABEL_CALENDAR_ADDED,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    calendarAddedId = created.data.id!;
    console.log(`ラベル "${LABEL_CALENDAR_ADDED}" を作成しました: ${calendarAddedId}`);
  }

  cachedLabelIds = { addToCalendarId, calendarAddedId };
  return cachedLabelIds;
}

/**
 * メールのラベルを AddToCalendar → CalendarAdded にアトミックに入れ替える。
 */
export async function swapLabels(
  gmail: gmail_v1.Gmail,
  messageId: string,
  labelIds: LabelIds,
): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [labelIds.calendarAddedId],
      removeLabelIds: [labelIds.addToCalendarId],
    },
  });
}
