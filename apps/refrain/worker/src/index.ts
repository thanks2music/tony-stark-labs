import { computeObjectKey, sha256 } from './hash';
import { R2Storage, type Storage } from './storage';

// The Worker owns its whole hostname (a Workers Custom Domain), so paths carry no app prefix.
const UPLOAD_PATH = '/upload';
const IMAGE_PATH_PREFIX = '/i/';
const OBJECT_KEY_RE = /^[0-9a-f]{32}\.png$/;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Room for the multipart boundaries and headers around the image itself.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const TOO_LARGE = `Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const storage = new R2Storage(env.BUCKET);

    if (request.method === 'POST' && url.pathname === UPLOAD_PATH) {
      return handleUpload(request, url.origin, env, storage);
    }
    if (request.method === 'GET' && url.pathname.startsWith(IMAGE_PATH_PREFIX)) {
      return handleFetch(request, url.pathname, storage, ctx);
    }
    return text(404, 'Not Found');
  },
} satisfies ExportedHandler<Env>;

async function handleUpload(
  request: Request,
  origin: string,
  env: Env,
  storage: Storage,
): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!auth || !(await verifyBearer(auth, env.UPLOAD_TOKEN))) {
    return text(401, 'Unauthorized');
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return text(400, 'Expected multipart/form-data with imagedata field');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return text(413, TOO_LARGE);
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

  if (file.size > MAX_UPLOAD_BYTES) {
    return text(413, TOO_LARGE);
  }
  // Check the signature from the first bytes before copying the whole image.
  if (!isPng(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer())) {
    return text(415, 'Only PNG images are accepted');
  }

  const bytes = await file.arrayBuffer();

  const key = `${await computeObjectKey(bytes)}.png`;
  await storage.put(key, bytes, 'image/png');

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
      'x-content-type-options': 'nosniff',
    },
  });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

function isPng(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, PNG_SIGNATURE.length));
  return PNG_SIGNATURE.every((byte, i) => head[i] === byte);
}

/**
 * Compares the bearer token with the expected one in constant time.
 * Both sides are hashed first so that a length mismatch does not return early
 * and reveal the token's length.
 */
async function verifyBearer(header: string, expected: string): Promise<boolean> {
  if (!header.startsWith('Bearer ')) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    sha256(encoder.encode(header.slice('Bearer '.length))),
    sha256(encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function text(status: number, body: string): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
