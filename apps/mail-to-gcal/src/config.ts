import { z } from 'zod';

const OAuthCredentialsSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>;

const OAuthCredentialsEnv = z
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
  .optional();

const EnvSchema = z.object({
  GCP_PROJECT_ID: z.string().min(1).default('wao-event-automation'),
  PUBSUB_TOPIC: z.string().min(1).default('gmail-notifications'),
  GOOGLE_CALENDAR_ID: z.string().min(1).default('primary'),
  // OAUTH_CREDENTIALS は auth/oauth.ts 実行時に required。テスト中の parser は不要なので loader 層では optional。
  OAUTH_CREDENTIALS: OAuthCredentialsEnv,
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`環境変数の検証に失敗しました:\n${formatted}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigForTesting(): void {
  cached = null;
}
