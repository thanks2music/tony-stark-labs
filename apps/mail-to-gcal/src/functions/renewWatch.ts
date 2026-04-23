import * as ff from '@google-cloud/functions-framework';
import { requireRuntimeConfig } from '../config.js';
import { getGmailClient } from '../gmail/client.js';
import { registerWatch } from '../gmail/watchManager.js';

// module load 時に必須設定を検証（fail-fast）
requireRuntimeConfig();

ff.http('renewWatch', async (_req, res) => {
  try {
    const gmail = getGmailClient();
    await registerWatch(gmail);
    res.status(200).send('watch() の再登録が完了しました');
  } catch (err) {
    console.error('watch() の再登録に失敗:', err);
    res.status(500).send('watch() の再登録に失敗しました');
  }
});
