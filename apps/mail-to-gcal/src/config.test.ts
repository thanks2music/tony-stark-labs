import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfigForTesting } from './config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    resetConfigForTesting();
  });

  it('OAUTH_CREDENTIALS があればデフォルトで読み込める', () => {
    const cfg = loadConfig({ OAUTH_CREDENTIALS: '{}' });
    expect(cfg.GCP_PROJECT_ID).toBe('wao-event-automation');
    expect(cfg.PUBSUB_TOPIC).toBe('gmail-notifications');
    expect(cfg.GOOGLE_CALENDAR_ID).toBe('primary');
    expect(cfg.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('OAUTH_CREDENTIALS が無いと throw する', () => {
    expect(() => loadConfig({})).toThrow(/OAUTH_CREDENTIALS/);
  });

  it('ANTHROPIC_API_KEY をセットすると読み取れる', () => {
    const cfg = loadConfig({
      OAUTH_CREDENTIALS: '{}',
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
    });
    expect(cfg.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
  });

  it('カスタム値を上書きできる', () => {
    const cfg = loadConfig({
      OAUTH_CREDENTIALS: '{}',
      GCP_PROJECT_ID: 'custom-proj',
      PUBSUB_TOPIC: 'custom-topic',
      GOOGLE_CALENDAR_ID: 'my-cal@group.calendar.google.com',
    });
    expect(cfg.GCP_PROJECT_ID).toBe('custom-proj');
    expect(cfg.PUBSUB_TOPIC).toBe('custom-topic');
    expect(cfg.GOOGLE_CALENDAR_ID).toBe('my-cal@group.calendar.google.com');
  });
});
