import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfigForTesting } from './config.js';

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

  it('OAUTH_CREDENTIALS は optional: 設定されていれば読める', () => {
    const cfg = loadConfig({ OAUTH_CREDENTIALS: '{}' });
    expect(cfg.OAUTH_CREDENTIALS).toBe('{}');
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

  it('空文字列の GOOGLE_CALENDAR_ID は z.string().min(1) で throw する', () => {
    expect(() => loadConfig({ GOOGLE_CALENDAR_ID: '' })).toThrow(/GOOGLE_CALENDAR_ID/);
  });
});
