import { computeObjectKey } from './hash';
import { R2Storage, type Storage } from './storage';

const PATH_PREFIX = '/apps/refrain';
const UPLOAD_PATH = `${PATH_PREFIX}/upload`;
const IMAGE_PATH_PREFIX = `${PATH_PREFIX}/i/`;
const OBJECT_KEY_RE = /^[0-9a-f]{32}\.png$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const storage = new R2Storage(env.BUCKET);

    if (request.method === 'POST' && url.pathname === UPLOAD_PATH) {
      return handleUpload(request, env, storage);
    }
    if (request.method === 'GET' && url.pathname.startsWith(IMAGE_PATH_PREFIX)) {
      return handleFetch(request, url.pathname, storage, ctx);
    }
    return text(404, 'Not Found');
  },
} satisfies ExportedHandler<Env>;

async function handleUpload(request: Request, env: Env, storage: Storage): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!auth || !verifyBearer(auth, env.UPLOAD_TOKEN)) {
    return text(401, 'Unauthorized');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return text(400, 'Expected multipart/form-data with imagedata field');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return text(400, 'Malformed multipart body');
  }

  const file = form.get('imagedata');
  if (file === null || typeof file === 'string') {
    return text(400, 'Missing imagedata field');
  }

  const bytes = await file.arrayBuffer();
  const key = `${await computeObjectKey(bytes)}.png`;
  await storage.put(key, bytes, 'image/png');

  const origin = new URL(request.url).origin;
  return text(200, `${origin}${IMAGE_PATH_PREFIX}${key}`);
}

async function handleFetch(
  request: Request,
  pathname: string,
  storage: Storage,
  ctx: ExecutionContext,
): Promise<Response> {
  const filename = pathname.slice(IMAGE_PATH_PREFIX.length);
  if (!OBJECT_KEY_RE.test(filename)) return text(404, 'Not Found');

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const obj = await storage.get(filename);
  if (!obj) return text(404, 'Not Found');

  const response = new Response(obj.body, {
    status: 200,
    headers: {
      'content-type': obj.contentType,
      'content-length': String(obj.size),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

function verifyBearer(header: string, expected: string): boolean {
  if (!header.startsWith('Bearer ')) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(header.slice('Bearer '.length));
  const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

function text(status: number, body: string): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
