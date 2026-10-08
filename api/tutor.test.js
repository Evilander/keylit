import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tutor from './tutor.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function request(origin = 'http://localhost:5173', body = { messages: [{ role: 'user', content: 'History' }] }) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST'; req.headers = { origin }; req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}
function response() {
  const res = new EventEmitter();
  res.headers = {}; res.output = ''; res.headersSent = false;
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.write = value => { res.headersSent = true; res.output += Buffer.from(value).toString(); };
  res.end = value => { if (value) res.output += value; };
  return res;
}
describe('local subscription tutor proxy', () => {
  it('refuses foreign and absent browser origins before any inference', async () => {
    const mock = vi.spyOn(globalThis, 'fetch');
    for (const origin of ['https://foreign.example', '']) {
      const res = response(); await tutor(request(origin), res); expect(res.statusCode).toBe(403);
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it('keeps the gateway key server-side and routes only the supplied text messages', async () => {
    vi.stubEnv('KEYLIT_SUBSCRIPTION_BASE_URL', 'http://127.0.0.1:47831/v1');
    vi.stubEnv('KEYLIT_SUBSCRIPTION_API_KEY', 'private-gateway-key');
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    const res = response(); await tutor(request(), res);
    expect(mock.mock.calls[0][0].href).toBe('http://127.0.0.1:47831/v1/chat/completions');
    expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer private-gateway-key');
    expect(res.output).toContain('OK'); expect(res.output).not.toContain('private-gateway-key');
  });
  it('refuses a public or arbitrary configured proxy endpoint', async () => {
    vi.stubEnv('KEYLIT_SUBSCRIPTION_BASE_URL', 'https://foreign.example/v1');
    vi.stubEnv('KEYLIT_SUBSCRIPTION_API_KEY', 'private-gateway-key');
    const mock = vi.spyOn(globalThis, 'fetch');
    const res = response(); await tutor(request(), res); expect(res.statusCode).toBe(503);
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('tutor stream backpressure', () => {
  it.each(['drain', 'error', 'close', 'abort'])('waits for %s and removes listeners', async event => {
    const { writeChunk } = await import('./tutor.js');
    const res = response();
    res.write = vi.fn(() => false);
    const controller = new AbortController();
    let settled = false;
    const result = writeChunk(res, Buffer.from('data'), controller.signal);
    result.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    if (event === 'abort') controller.abort();
    else res.emit(event, new Error('socket failed'));
    if (event === 'drain') await result;
    else await expect(result).rejects.toThrow();
    for (const name of ['drain', 'error', 'close']) expect(res.listenerCount(name)).toBe(0);
  });
  it('preserves split Unicode messages and cleans handler listeners', async () => {
    vi.stubEnv('KEYLIT_SUBSCRIPTION_BASE_URL', 'http://127.0.0.1:47831/v1');
    vi.stubEnv('KEYLIT_SUBSCRIPTION_API_KEY', 'private');
    const body = { messages: [{ role: 'user', content: 'B♭ 春' }] };
    const req = request();
    const bytes = Buffer.from(JSON.stringify(body));
    const stream = Readable.from([...bytes].map(byte => Buffer.from([byte])));
    Object.assign(stream, { method: req.method, headers: req.headers, socket: req.socket });
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: OK\n\n'));
    const res = response();
    await tutor(stream, res);
    expect(JSON.parse(mock.mock.calls[0][1].body).messages).toEqual(body.messages);
    expect(res.listenerCount('close')).toBe(0);
    expect(res.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('aborted')).toBe(0);
  });
  it('bounds preparsed request bytes before calling the gateway', async () => {
    vi.stubEnv('KEYLIT_SUBSCRIPTION_BASE_URL', 'http://127.0.0.1:47831/v1');
    vi.stubEnv('KEYLIT_SUBSCRIPTION_API_KEY', 'private');
    const mock = vi.spyOn(globalThis, 'fetch');
    const req = request(); req.body = { messages: [{ role: 'user', content: '春'.repeat(50000) }] };
    const res = response(); await tutor(req, res);
    expect(res.statusCode).toBe(413);
    expect(mock).not.toHaveBeenCalled();
  });
});
