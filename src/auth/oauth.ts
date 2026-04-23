import { google } from "googleapis";

interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

let cachedAuth: InstanceType<typeof google.auth.OAuth2> | null = null;

/**
 * OAuth2クライアントを取得する。
 * Secret Manager から取得した OAUTH_CREDENTIALS 環境変数を使用。
 * Cloud Functions のウォームスタートに対応するため、モジュールレベルでキャッシュする。
 */
export function getAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  if (cachedAuth) return cachedAuth;

  const raw = process.env.OAUTH_CREDENTIALS;
  if (!raw) {
    throw new Error("OAUTH_CREDENTIALS 環境変数が設定されていません");
  }

  const creds: OAuthCredentials = JSON.parse(raw);
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });

  cachedAuth = auth;
  return auth;
}
