import { z } from 'zod';

const OAuthCredentialsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>;

// 空文字列は「未設定」と同義。.env の `KEY=` 表記や GHA secrets の未定義値を undefined に正規化する。
const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.length === 0 ? undefined : value;

const OAuthCredentialsEnv = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .min(1)
    .transform((raw, ctx): unknown => {
      try {
        return JSON.parse(raw);
      } catch (e) {
        ctx.addIssue({
          code: 'custom',
          message: `JSON として解釈できません: ${e instanceof Error ? e.message : String(e)}`,
        });
        return z.NEVER;
      }
    })
    .pipe(OAuthCredentialsSchema)
    .optional(),
);

const OptionalString = z.preprocess(emptyStringToUndefined, z.string().min(1).optional());

const EnvSchema = z.object({
  GCP_PROJECT_ID: z.string().min(1).default('wao-event-automation'),
  PUBSUB_TOPIC: z.string().min(1).default('gmail-notifications'),
  GOOGLE_CALENDAR_ID: z.string().min(1).default('primary'),
  // OAUTH_CREDENTIALS は auth/oauth.ts 実行時に required。テスト中の parser は不要なので loader 層では optional。
  // 本番起動時の fail-fast は requireRuntimeConfig() が担う。
  OAUTH_CREDENTIALS: OAuthCredentialsEnv,
  ANTHROPIC_API_KEY: OptionalString,
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  // source が明示指定された場合は cache を bypass（DI 用途の footgun 防止）
  const useCache = source === process.env;
  if (useCache && cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`環境変数の検証に失敗しました:\n${formatted}`);
  }
  if (useCache) cached = parsed.data;
  return parsed.data;
}

/**
 * Cloud Functions handler の先頭で呼び、本番稼働に必須の設定を fail-fast する。
 * `loadConfig()` は loader 層で optional のフィールドを許容するため、runtime 検証は別途必要。
 * `source` を渡すとテスト時に process.env を touch せずに検証できる。
 */
export function requireRuntimeConfig(source?: NodeJS.ProcessEnv): Env {
  const cfg = loadConfig(source);
  if (!cfg.OAUTH_CREDENTIALS) {
    throw new Error('OAUTH_CREDENTIALS 環境変数が設定されていません（起動中断）');
  }
  return cfg;
}

export function resetConfigForTesting(): void {
  cached = null;
}
