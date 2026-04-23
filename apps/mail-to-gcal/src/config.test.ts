import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, requireRuntimeConfig, resetConfigForTesting } from './config.js';

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

  it('空文字列の ANTHROPIC_API_KEY は undefined 扱いにする', () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: '' });
    expect(cfg.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('空文字列の OAUTH_CREDENTIALS は undefined 扱いにする', () => {
    const cfg = loadConfig({ OAUTH_CREDENTIALS: '' });
    expect(cfg.OAUTH_CREDENTIALS).toBeUndefined();
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
    // NOTE: preprocess は OAUTH_CREDENTIALS / ANTHROPIC_API_KEY のみに適用。
    // GOOGLE_CALENDAR_ID は .default() が効くが、明示的に空文字列を渡すと .min(1) 違反で throw する。
    expect(() => loadConfig({ GOOGLE_CALENDAR_ID: '' })).toThrow(/GOOGLE_CALENDAR_ID/);
  });

  it('明示 source と process.env 由来の cache は分離されている', () => {
    const first = loadConfig({ GCP_PROJECT_ID: 'via-source-1' });
    const second = loadConfig({ GCP_PROJECT_ID: 'via-source-2' });
    expect(first.GCP_PROJECT_ID).toBe('via-source-1');
    expect(second.GCP_PROJECT_ID).toBe('via-source-2');
  });
});

describe('requireRuntimeConfig', () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it('OAUTH_CREDENTIALS が設定されていれば cfg を返す', () => {
    const original = process.env.OAUTH_CREDENTIALS;
    process.env.OAUTH_CREDENTIALS = VALID_OAUTH;
    try {
      const cfg = requireRuntimeConfig();
      expect(cfg.OAUTH_CREDENTIALS).toEqual({
        client_id: 'cid',
        client_secret: 'csec',
        refresh_token: 'rtoken',
      });
    } finally {
      if (original === undefined) delete process.env.OAUTH_CREDENTIALS;
      else process.env.OAUTH_CREDENTIALS = original;
    }
  });

  it('OAUTH_CREDENTIALS が未設定なら throw する', () => {
    const original = process.env.OAUTH_CREDENTIALS;
    delete process.env.OAUTH_CREDENTIALS;
    try {
      expect(() => requireRuntimeConfig()).toThrow(/OAUTH_CREDENTIALS/);
    } finally {
      if (original !== undefined) process.env.OAUTH_CREDENTIALS = original;
    }
  });
});
