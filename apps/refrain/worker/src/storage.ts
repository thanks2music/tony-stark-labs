export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  size: number;
}

export interface Storage {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
}

export class R2Storage implements Storage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      size: obj.size,
    };
  }
}
