import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { uploadImage } from '../src/upload';
import { useTempDir } from './helpers';

const originalFetch = globalThis.fetch;

function stubFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = impl as unknown as typeof fetch;
}

describe('uploadImage', () => {
  const tmp = useTempDir('refrain-upload-');
  let imagePath: string;

  beforeEach(() => {
    imagePath = join(tmp.path, 'screenshot.png');
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the trimmed URL on 200', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('https://example.test/apps/refrain/i/abc.png\n', { status: 200 }),
      ),
    );

    const url = await uploadImage({
      filePath: imagePath,
      endpoint: 'https://example.test/apps/refrain/upload',
      token: 'my-token',
    });
    expect(url).toBe('https://example.test/apps/refrain/i/abc.png');
  });

  it('sends the Bearer token and a multipart imagedata Blob with the source filename', async () => {
    const spy = mock((_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer mytoken');

      expect(init?.body).toBeInstanceOf(FormData);
      const body = init?.body as FormData;
      const imagedata = body.get('imagedata');
      expect(imagedata).toBeInstanceOf(Blob);
      expect((imagedata as File).name).toBe('screenshot.png');

      return Promise.resolve(new Response('https://out', { status: 200 }));
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    await uploadImage({
      filePath: imagePath,
      endpoint: 'https://e/upload',
      token: 'mytoken',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('throws with status and body detail on non-2xx', async () => {
    stubFetch(() =>
      Promise.resolve(new Response('Unauthorized\n', { status: 401, statusText: 'Unauthorized' })),
    );

    await expect(
      uploadImage({ filePath: imagePath, endpoint: 'https://e/upload', token: 'bad' }),
    ).rejects.toThrow(/upload failed: 401.*Unauthorized/);
  });

  it('omits the body suffix when the response body is empty', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 500, statusText: 'Server Error' })));

    await expect(
      uploadImage({ filePath: imagePath, endpoint: 'https://e/upload', token: 't' }),
    ).rejects.toThrow(/^upload failed: 500 Server Error$/);
  });

  it('throws before calling fetch when the image file is missing', async () => {
    const spy = mock();
    globalThis.fetch = spy as unknown as typeof fetch;

    await expect(
      uploadImage({
        filePath: join(tmp.path, 'does-not-exist.png'),
        endpoint: 'https://e/upload',
        token: 't',
      }),
    ).rejects.toThrow(/not found/);
    expect(spy).not.toHaveBeenCalled();
  });
});
