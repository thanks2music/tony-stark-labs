import { google } from 'googleapis';
import { loadConfig } from '../config.js';

let cachedAuth: InstanceType<typeof google.auth.OAuth2> | null = null;

/**
 * OAuth2クライアントを取得する。
 * Cloud Functions のウォームスタートに対応するため、モジュールレベルでキャッシュする。
 */
export function getAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  if (cachedAuth) return cachedAuth;

  const creds = loadConfig().OAUTH_CREDENTIALS;
  if (!creds) {
    throw new Error('OAUTH_CREDENTIALS 環境変数が設定されていません');
  }
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  auth.setCredentials({ refresh_token: creds.refresh_token });

  cachedAuth = auth;
  return auth;
}
