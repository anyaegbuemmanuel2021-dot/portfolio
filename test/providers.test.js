import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DBRIJ_S3_ENDPOINT = 'https://s3.dbrij.com';
process.env.DBRIJ_S3_REGION = 'auto';
process.env.DBRIJ_BUCKET = 'portfolio-media';
process.env.DBRIJ_KEY_ID = 'dbsk-test-access';
process.env.DBRIJ_KEY_SECRET = 'dbss-test-secret';
process.env.DBRIJ_MEDIA_PUBLIC_BASE = 'https://files.dbrij.com/test-media-bucket-id';
process.env.EMAIL_PROVIDER = 'brevo';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.EMAIL_FROM = 'owner@example.test';

const { dbrijStorageProvider } = await import('../server/providers/storage.js');
const { createMailer } = await import('../server/providers/mail.js');

test('Dbrij provider signs path-style S3 requests and supports put/get/delete', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === 'GET') return new Response(Buffer.from('image-data'), { status: 200 });
    return new Response(null, { status: init.method === 'PUT' ? 200 : 204 });
  };
  try {
    const store = dbrijStorageProvider();
    await store.put('uploads/2026/11/test.webp', Buffer.from('image-data'), 'image/webp');
    const got = await store.get('uploads/2026/11/test.webp');
    await store.remove('uploads/2026/11/test.webp');
    assert.equal(got.toString(), 'image-data');
    assert.deepEqual(calls.map(call => call.init.method), ['PUT', 'GET', 'DELETE']);
    assert.ok(calls.every(call => call.url.startsWith('https://s3.dbrij.com/portfolio-media/')));
    assert.ok(calls.every(call => call.init.headers.Authorization.startsWith('AWS4-HMAC-SHA256')));
    assert.ok(calls[0].init.headers.Authorization.includes('/auto/s3/aws4_request'));
    assert.equal(store.publicUrl('uploads/a.webp'), '/api/media/file?key=uploads%2Fa.webp');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Dbrij provider rejects unsafe keys and non-HTTPS endpoints', async () => {
  const store = dbrijStorageProvider();
  await assert.rejects(() => store.get('../secret.txt'), /Unsafe storage key/);
  assert.throws(() => dbrijStorageProvider({ endpoint: 'http://s3.dbrij.com', region: 'auto', bucket: 'media', accessKeyId: 'id', secretAccessKey: 'secret', publicBase: 'https://files.dbrij.com/bucket' }), /official HTTPS endpoint/);
  assert.throws(() => dbrijStorageProvider({ endpoint: 'https://evil.example', region: 'auto', bucket: 'media', accessKeyId: 'id', secretAccessKey: 'secret', publicBase: 'https://files.dbrij.com/bucket' }), /official HTTPS endpoint/);
  assert.throws(() => dbrijStorageProvider({ endpoint: 'https://s3.dbrij.com', region: 'auto', bucket: 'Bad_Bucket', accessKeyId: 'id', secretAccessKey: 'secret', publicBase: 'https://files.dbrij.com/bucket' }), /bucket name/);
});

test('Brevo provider submits authenticated transactional email and returns provider id', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init, body: JSON.parse(init.body) };
    return Response.json({ messageId: '<message-123>' }, { status: 201 });
  };
  try {
    const mailer = createMailer();
    const result = await mailer.send({ to: 'client@example.test', subject: 'Project update', text: 'Hello', replyTo: 'owner@example.test' });
    assert.equal(mailer.real, true);
    assert.equal(result.id, '<message-123>');
    assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(request.init.headers['api-key'], 'test-brevo-key');
    assert.equal(request.body.to[0].email, 'client@example.test');
    assert.equal(request.body.replyTo.email, 'owner@example.test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
