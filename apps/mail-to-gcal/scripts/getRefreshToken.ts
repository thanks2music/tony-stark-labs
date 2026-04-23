/**
 * 初回OAuth認証用スクリプト（ローカル実行専用）
 *
 * 使い方:
 *   1. GCPコンソールから OAuth 2.0 クライアントID を作成
 *   2. credentials.json をプロジェクトルートにダウンロード
 *   3. bun run scripts/getRefreshToken.ts を実行
 *   4. ブラウザで認証を完了
 *   5. 表示された refresh_token を Secret Manager に保存
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
];

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

async function main() {
  // credentials.json を読み込み
  let credentials: { installed?: { client_id: string; client_secret: string } };
  try {
    credentials = JSON.parse(readFileSync('credentials.json', 'utf-8'));
  } catch {
    console.error('credentials.json が見つかりません。GCPコンソールからダウンロードしてください。');
    process.exit(1);
  }

  const { client_id, client_secret } = credentials.installed ?? {};
  if (!client_id || !client_secret) {
    console.error(
      'credentials.json の形式が正しくありません。OAuth 2.0 クライアントID（デスクトップアプリ）を使用してください。',
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  // 認証URLを生成
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n以下のURLをブラウザで開いて認証してください:\n');
  console.log(authUrl);
  console.log('\n認証完了後、リダイレクトを待っています...\n');

  // ローカルサーバーでリダイレクトを受け取る
  const code = await waitForAuthCode();

  // 認証コードをトークンに交換
  const { tokens } = await oauth2Client.getToken(code);

  console.log('\n=== 認証成功 ===\n');
  console.log('Refresh Token:');
  console.log(tokens.refresh_token);
  console.log('\n以下のコマンドで Secret Manager に保存してください:\n');
  console.log(
    `echo '{"client_id":"${client_id}","client_secret":"${client_secret}","refresh_token":"${tokens.refresh_token}"}' | gcloud secrets create oauth-credentials --data-file=-`,
  );
  console.log();

  process.exit(0);
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>認証エラー</h1><p>認証が拒否されました。</p>');
        server.close();
        reject(new Error(`認証エラー: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>認証成功</h1><p>このタブを閉じてターミナルに戻ってください。</p>');
        server.close();
        resolve(code);
        return;
      }

      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid request');
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`リダイレクト待受中: http://localhost:${REDIRECT_PORT}`);
    });
  });
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
