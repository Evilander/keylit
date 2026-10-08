import { readJsonBody } from '../server/http-body.mjs';
import { createRateLimiter } from './analyze.js';

const allow = createRateLimiter({ limit: 20, windowMs: 60000 });

export default async function tutor(req, res) {
  const origin = req.headers.origin;
  const origins = (process.env.KEYLIT_TUTOR_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim());
  if (!origin || !origins.includes(origin)) { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Origin not allowed' })); }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  if (!allow(req.socket.remoteAddress || 'local')) { res.statusCode = 429; return res.end(JSON.stringify({ error: 'Rate limit exceeded' })); }
  const base = process.env.KEYLIT_SUBSCRIPTION_BASE_URL;
  const key = process.env.KEYLIT_SUBSCRIPTION_API_KEY;
  let endpoint;
  try {
    endpoint = new URL(`${(base || '').replace(/\/+$/, '')}/chat/completions`);
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password) throw new Error();
  } catch { res.statusCode = 503; return res.end(JSON.stringify({ error: 'Local subscription gateway is not configured' })); }
  if (!key) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'Local subscription gateway is not configured' })); }
  let body;
  try {
    body = await readJsonBody(req, 128 * 1024);
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 ||
        body.messages.some(message => !message || !['system', 'developer', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) throw new Error();
  } catch (error) { res.statusCode = error?.tooLarge ? 413 : 400; return res.end(JSON.stringify({ error: 'Invalid tutor messages' })); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let disconnected = false;
  const abort = () => { disconnected = true; controller.abort(); };
  res.on('close', abort);
  res.on('error', abort);
  req.on('aborted', abort);
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.KEYLIT_MODEL || 'gpt-6-astra', messages: body.messages, stream: true }),
      signal: controller.signal,
    });
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.ok ? 'text/event-stream' : 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!upstream.ok) return res.end(JSON.stringify({ error: `Subscription gateway failed (${upstream.status})` }));
    for await (const chunk of upstream.body) await writeChunk(res, chunk, controller.signal);
    res.end();
  } catch {
    if (disconnected || res.destroyed || res.writableEnded) return;
    if (!res.headersSent) { res.statusCode = 502; res.end(JSON.stringify({ error: 'Local subscription gateway request failed' })); }
    else res.end('data: {"error":{"message":"Subscription request interrupted"}}\n\n');
  } finally {
    clearTimeout(timeout);
    controller.abort();
    res.removeListener('close', abort);
    res.removeListener('error', abort);
    req.removeListener('aborted', abort);
  }
}

// Pause upstream consumption until the socket can accept another chunk.
export function writeChunk(res, chunk, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.removeListener('drain', drained);
      res.removeListener('error', failed);
      res.removeListener('close', closed);
      signal.removeEventListener('abort', closed);
    };
    const drained = () => { cleanup(); resolve(); };
    const failed = (error) => { cleanup(); reject(error); };
    const closed = () => failed(new Error('Response interrupted'));
    if (signal.aborted || res.destroyed || res.writableEnded) return closed();
    res.once('drain', drained);
    res.once('error', failed);
    res.once('close', closed);
    signal.addEventListener('abort', closed, { once: true });
    try { if (res.write(chunk) !== false) drained(); }
    catch (error) { failed(error); }
  });
}
