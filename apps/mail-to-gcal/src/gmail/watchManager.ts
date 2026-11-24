import type { gmail_v1 } from 'googleapis';
import { loadConfig } from '../config.js';

/**
 * Gmail API watch() を登録する。
 * watch() は最大7日間で失効するため、Cloud Scheduler で毎日再登録する。
 */
export async function registerWatch(
  gmail: gmail_v1.Gmail,
  projectId?: string,
): Promise<gmail_v1.Schema$WatchResponse> {
  const cfg = loadConfig();
  const project = projectId ?? cfg.GCP_PROJECT_ID;
  const topicName = `projects/${project}/topics/${cfg.PUBSUB_TOPIC}`;

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    },
  });

  console.log(
    `watch() 登録完了 — historyId: ${res.data.historyId}, expiration: ${res.data.expiration}`,
  );

  return res.data;
}
