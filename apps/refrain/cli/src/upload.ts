import { basename } from 'node:path';

export interface UploadParams {
  filePath: string;
  endpoint: string;
  token: string;
}

export async function uploadImage(params: UploadParams): Promise<string> {
  const file = Bun.file(params.filePath);
  if (!(await file.exists())) {
    throw new Error(`image file not found: ${params.filePath}`);
  }

  // Re-wrap as a Blob so the multipart filename is just the basename;
  // a BunFile keeps its absolute path as `.name`, which would leak the
  // local filesystem layout into the Content-Disposition header.
  const bytes = await file.arrayBuffer();
  const body = new FormData();
  body.append('imagedata', new Blob([bytes], { type: 'image/png' }), basename(params.filePath));

  const res = await fetch(params.endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.token}` },
    body,
  });

  if (!res.ok) {
    const detail = (await res.text()).trim();
    throw new Error(
      `upload failed: ${res.status} ${res.statusText}${detail === '' ? '' : `: ${detail}`}`,
    );
  }

  return (await res.text()).trim();
}
