import type { gmail_v1 } from "googleapis";

const DEFAULT_PROJECT_ID = "wao-event-automation";
const TOPIC_NAME = "gmail-notifications";

/**
 * Gmail API watch() を登録する。
 * watch() は最大7日間で失効するため、Cloud Scheduler で毎日再登録する。
 */
export async function registerWatch(
  gmail: gmail_v1.Gmail,
  projectId?: string,
): Promise<gmail_v1.Schema$WatchResponse> {
  const project = projectId ?? process.env.GCP_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  const topicName = `projects/${project}/topics/${TOPIC_NAME}`;

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    },
  });

  console.log(
    `watch() 登録完了 — historyId: ${res.data.historyId}, expiration: ${res.data.expiration}`,
  );

  return res.data;
}
