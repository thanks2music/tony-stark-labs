import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker, { MAX_UPLOAD_BYTES } from '../src/index';

const TOKEN = 'test-token-abc123';
const BASE_URL = 'http://worker.local';
const UPLOAD_URL = `${BASE_URL}/upload`;

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0xfd, 0xd4, 0x9a,
  0x73, 0x00, 0x00, 0x00, 0x16, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0xfc, 0xcf, 0xc0, 0xc0,
  0xc0, 0xc0, 0xc4, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0xc0, 0xc0, 0x00, 0x00, 0x00, 0x20, 0x00, 0x01,
  0x6a, 0x8f, 0xd8, 0x9f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Builds a multipart upload the way real clients send it (Bun's fetch and curl -F),
 * with a Content-Length header. A Request built straight from FormData omits it.
 */
async function multipartRequest(form: FormData, token?: string): Promise<Request> {
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  const headers = new Headers({
    'content-type': encoded.headers.get('content-type') ?? '',
    'content-length': String(body.byteLength),
  });
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  return new Request(UPLOAD_URL, { method: 'POST', headers, body });
}

function buildUploadRequest(token?: string, bytes: Uint8Array = PNG_BYTES): Promise<Request> {
  const form = new FormData();
  form.append('imagedata', new Blob([bytes], { type: 'image/png' }), 'test.png');
  return multipartRequest(form, token);
}

/** A PNG signature followed by zero bytes, `size` bytes in total. */
function pngOfSize(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_BYTES.subarray(0, 8));
  return bytes;
}

async function dispatch(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('worker: POST /upload', () => {
  it('401 when Authorization header is missing', async () => {
    const res = await dispatch(await buildUploadRequest());
    expect(res.status).toBe(401);
  });

  it('401 when Bearer token is wrong', async () => {
    const res = await dispatch(await buildUploadRequest('wrong-token'));
    expect(res.status).toBe(401);
  });

  it('200 + URL body when token is valid', async () => {
    const res = await dispatch(await buildUploadRequest(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/^http:\/\/worker\.local\/i\/[0-9a-f]{32}\.png\n$/);
  });

  it('is idempotent for identical images', async () => {
    const a = await dispatch(await buildUploadRequest(TOKEN));
    const b = await dispatch(await buildUploadRequest(TOKEN));
    expect(await a.text()).toBe(await b.text());
  });

  it('400 when content-type is not multipart/form-data', async () => {
    const req = new Request(UPLOAD_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' },
      body: 'not multipart',
    });
    const res = await dispatch(req);
    expect(res.status).toBe(400);
  });

  it('413 when Content-Length is far above the limit, before reading the body', async () => {
    const req = new Request(UPLOAD_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(MAX_UPLOAD_BYTES * 2),
      },
      body: 'unused',
    });
    const res = await dispatch(req);
    expect(res.status).toBe(413);
  });

  it('411 when Content-Length is missing, so the size cannot be checked before reading', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('--x--\r\n'));
        controller.close();
      },
    });
    const req = new Request(UPLOAD_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'multipart/form-data; boundary=x',
      },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    const res = await dispatch(req);
    expect(res.status).toBe(411);
  });

  it('413 when the image is larger than the limit', async () => {
    const res = await dispatch(await buildUploadRequest(TOKEN, pngOfSize(MAX_UPLOAD_BYTES + 1)));
    expect(res.status).toBe(413);
  });

  it('accepts an image exactly at the limit', async () => {
    const res = await dispatch(await buildUploadRequest(TOKEN, pngOfSize(MAX_UPLOAD_BYTES)));
    expect(res.status).toBe(200);
  });

  it('415 when the content is not a PNG', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const res = await dispatch(await buildUploadRequest(TOKEN, jpeg));
    expect(res.status).toBe(415);
  });

  it('401 when the token differs only in length', async () => {
    const res = await dispatch(await buildUploadRequest(`${TOKEN}x`));
    expect(res.status).toBe(401);
  });

  it('400 when imagedata field is missing', async () => {
    const form = new FormData();
    form.append('other', 'foo');
    const res = await dispatch(await multipartRequest(form, TOKEN));
    expect(res.status).toBe(400);
  });
});

describe('worker: GET /i/:hash.png', () => {
  it('returns the stored PNG with expected headers', async () => {
    const upload = await dispatch(await buildUploadRequest(TOKEN));
    const url = (await upload.text()).trim();

    const res = await dispatch(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-length')).toBe(String(PNG_BYTES.byteLength));
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const got = new Uint8Array(await res.arrayBuffer());
    expect(got).toEqual(PNG_BYTES);
  });

  it('404 for invalid hash format', async () => {
    const res = await dispatch(new Request(`${BASE_URL}/i/short.png`));
    expect(res.status).toBe(404);
  });

  it('404 for non-existent hash', async () => {
    const res = await dispatch(new Request(`${BASE_URL}/i/00000000000000000000000000000000.png`));
    expect(res.status).toBe(404);
  });
});

describe('worker: unknown routes', () => {
  it('404 for /', async () => {
    const res = await dispatch(new Request(`${BASE_URL}/`));
    expect(res.status).toBe(404);
  });

  it('404 for the old /apps/refrain prefix', async () => {
    const res = await dispatch(new Request(`${BASE_URL}/apps/refrain/upload`, { method: 'POST' }));
    expect(res.status).toBe(404);
  });

  it('404 for other methods on upload path', async () => {
    const res = await dispatch(new Request(UPLOAD_URL, { method: 'GET' }));
    expect(res.status).toBe(404);
  });
});
