// Object storage providers behind one interface: put/get/remove.
// Local storage is for development only. Production uses Dbrij's S3-compatible endpoint.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { config } from '../config.js';

const safeKey = key => {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error('Unsafe storage key');
  }
  return key;
};

export function localStorageProvider(dir = config.storage.localDir) {
  const root = normalize(join(process.cwd(), dir));
  const full = key => {
    const file = normalize(join(root, safeKey(key)));
    if (!file.startsWith(root)) throw new Error('Unsafe path');
    return file;
  };
  return {
    name: 'local',
    publicUrl: key => `/api/media/file?key=${encodeURIComponent(safeKey(key))}`,
    async put(key, buffer) {
      const file = full(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, buffer);
    },
    async get(key) { return readFile(full(key)); },
    async remove(key) { await rm(full(key), { force: true }); },
  };
}

const sha256 = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Dbrij S3-compatible Object Storage provider.
 * Uses path-style URLs as required by Dbrij's documented S3 endpoint.
 */
export function dbrijStorageProvider(options = config.storage.dbrij) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = options || {};
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Dbrij storage is not fully configured. Set DBRIJ_S3_ENDPOINT, DBRIJ_BUCKET, DBRIJ_KEY_ID and DBRIJ_KEY_SECRET.');
  }
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' || base.hostname !== 's3.dbrij.com' || base.port || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('DBRIJ_S3_ENDPOINT must be the official HTTPS endpoint https://s3.dbrij.com');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('DBRIJ_BUCKET must be a 3-63 character lowercase bucket name using letters, numbers and hyphens');
  }
  const host = base.host;
  const signingRegion = region || 'auto';

  async function request(method, key, body = Buffer.alloc(0), mimeType) {
    const objectKey = safeKey(key);
    const encodedPath = `/${encodeURIComponent(bucket)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body);
    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(mimeType ? { 'content-type': mimeType } : {}),
    };
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers[name]}`).join('\n');
    const canonicalRequest = [method, encodedPath, '', `${canonicalHeaders}\n`, signedHeaderNames.join(';'), payloadHash].join('\n');
    const scope = `${dateStamp}/${signingRegion}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), signingRegion), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`;
    const response = await fetch(`${base.origin}${encodedPath}`, {
      method,
      headers: { ...headers, Authorization: authorization },
      body: method === 'PUT' ? body : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Dbrij S3 ${method} ${objectKey} failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return response;
  }

  return {
    name: 'dbrij',
    publicUrl: key => `/api/media/file?key=${encodeURIComponent(safeKey(key))}`,
    put: (key, buffer, mimeType) => request('PUT', key, buffer, mimeType),
    async get(key) {
      return Buffer.from(await (await request('GET', key)).arrayBuffer());
    },
    remove: key => request('DELETE', key),
  };
}



/** Cloudinary permanent media storage. Uploads are signed server-side; secrets never reach browsers. */
export function cloudinaryStorageProvider(options = config.storage.cloudinary) {
  const { cloudName, apiKey, apiSecret } = options || {};
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  if (!/^[a-z0-9-]+$/i.test(cloudName)) throw new Error('Invalid CLOUDINARY_CLOUD_NAME');
  const base = `https://api.cloudinary.com/v1_1/${cloudName}`;
  const resourceType = key => /\.(pdf|docx)$/i.test(key) ? 'raw' : 'image';
  const publicId = key => { const value = safeKey(key); return resourceType(value) === 'raw' ? value : value.replace(/\.[^.\/]+$/, ''); };
  const sign = params => {
    const canonical = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return createHash('sha1').update(canonical + apiSecret).digest('hex');
  };
  const urlFor = key => `https://res.cloudinary.com/${cloudName}/${resourceType(key)}/upload/${publicId(key)}`;
  return {
    name: 'cloudinary',
    publicUrl: key => urlFor(key),
    async put(key, buffer, mimeType = 'application/octet-stream') {
      const type = resourceType(key), timestamp = Math.floor(Date.now() / 1000), id = publicId(key);
      const params = { public_id: id, timestamp };
      const form = new FormData();
      form.set('file', new Blob([buffer], { type: mimeType }), key.split('/').pop());
      form.set('api_key', apiKey); form.set('timestamp', String(timestamp)); form.set('public_id', id); form.set('signature', sign(params));
      const response = await fetch(`${base}/${type}/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.secure_url) throw new Error(`Cloudinary upload failed (${response.status}): ${String(result.error?.message || 'Unknown provider error').slice(0, 240)}`);
      return result;
    },
    async get(key) {
      const response = await fetch(urlFor(key), { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Cloudinary media retrieval failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(key) {
      const type = resourceType(key), timestamp = Math.floor(Date.now() / 1000), id = publicId(key);
      const params = { public_id: id, timestamp };
      const form = new FormData(); form.set('public_id', id); form.set('timestamp', String(timestamp)); form.set('api_key', apiKey); form.set('signature', sign(params));
      const response = await fetch(`${base}/${type}/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !['ok', 'not found'].includes(result.result)) throw new Error(`Cloudinary delete failed (${response.status})`);
    },
  };
}
\nexport function createStorage(name = config.storage.provider) {
  if (name === 'cloudinary') return cloudinaryStorageProvider();
  if (name === 'dbrij') return dbrijStorageProvider();
  if (name === 'local') return localStorageProvider();
  throw new Error(`Unsupported storage provider: ${name}`);
}
