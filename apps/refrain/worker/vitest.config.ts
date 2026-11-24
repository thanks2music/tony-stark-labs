import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const TEST_UPLOAD_TOKEN = 'test-token-abc123';
// wrangler.toml の [secrets] required を、テストでは環境変数で満たす（未設定の警告を出さないため）
process.env.UPLOAD_TOKEN ??= TEST_UPLOAD_TOKEN;

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          UPLOAD_TOKEN: TEST_UPLOAD_TOKEN,
        },
      },
    }),
  ],
});
