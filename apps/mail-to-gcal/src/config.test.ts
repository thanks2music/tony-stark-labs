import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfigForTesting } from './config.js';

const VALID_OAUTH = JSON.stringify({
  client_id: 'cid',
  client_secret: 'csec',
  refresh_token: 'rtoken',
});

describe('loadConfig', () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it('env が空でもデフォルト値で読み込める', () => {
    const cfg = loadConfig({});
    expect(cfg.GCP_PROJECT_ID).toBe('wao-event-automation');
    expect(cfg.PUBSUB_TOPIC).toBe('gmail-notifications');
    expect(cfg.GOOGLE_CALENDAR_ID).toBe('primary');
    expect(cfg.OAUTH_CREDENTIALS).toBeUndefined();
    expect(cfg.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('OAUTH_CREDENTIALS を JSON として validate してパース済みオブジェクトを返す', () => {
    const cfg = loadConfig({ OAUTH_CREDENTIALS: VALID_OAUTH });
    expect(cfg.OAUTH_CREDENTIALS).toEqual({
      client_id: 'cid',
      client_secret: 'csec',
      refresh_token: 'rtoken',
    });
  });

  it('OAUTH_CREDENTIALS が壊れた JSON の場合は起動に失敗する', () => {
    expect(() => loadConfig({ OAUTH_CREDENTIALS: 'not-json' })).toThrow(/OAUTH_CREDENTIALS/);
  });

  it('OAUTH_CREDENTIALS に必須フィールドが欠けている場合は起動に失敗する', () => {
    expect(() => loadConfig({ OAUTH_CREDENTIALS: '{}' })).toThrow(/OAUTH_CREDENTIALS/);
  });

  it('ANTHROPIC_API_KEY をセットすると読み取れる', () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(cfg.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
  });

  it('カスタム値を上書きできる', () => {
    const cfg = loadConfig({
      GCP_PROJECT_ID: 'custom-proj',
      PUBSUB_TOPIC: 'custom-topic',
      GOOGLE_CALENDAR_ID: 'my-cal@group.calendar.google.com',
    });
    expect(cfg.GCP_PROJECT_ID).toBe('custom-proj');
    expect(cfg.PUBSUB_TOPIC).toBe('custom-topic');
    expect(cfg.GOOGLE_CALENDAR_ID).toBe('my-cal@group.calendar.google.com');
  });

  it('GOOGLE_CALENDAR_ID に空文字列が渡された場合は起動に失敗する', () => {
    expect(() => loadConfig({ GOOGLE_CALENDAR_ID: '' })).toThrow(/GOOGLE_CALENDAR_ID/);
  });
});
