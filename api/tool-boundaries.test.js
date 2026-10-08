import { Readable } from 'node:stream';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { handler as ingest } from '../tools/ingest_server.mjs';
import { handler as harvest } from '../tools/harvester_server.mjs';
import { buildManifest } from '../tools/build_manifest.mjs';
import { curlBinary } from '../tools/album_tabs_fetch.mjs';

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn(), readFile: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
const response = () => ({ setHeader() {}, writeHead(code) { this.statusCode = code; }, end(body) { this.body = body; } });
function request(url, body) {
  const req = Readable.from([...Buffer.from(JSON.stringify(body))].map(byte => Buffer.from([byte])));
  return Object.assign(req, { url, method: 'POST', headers: {} });
}
it('rejects malformed ingest metadata without touching disk', async () => {
  for (const body of [null, { id: 'test', title: 'Song' }, { id: 'test', source: 'test', title: '春', artist: 123 }, { id: 'test', source: 'test', title: 'Song', body: {} }]) {
    const res = response(); await ingest(request('/song', body), res);
    expect(res.statusCode).toBe(400);
    expect(writeFile).not.toHaveBeenCalled();
  }
});
it('both local readers enforce streamed and preparsed byte limits', async () => {
  for (const [handler, url, size] of [[ingest, '/song', 8 * 1024 * 1024], [harvest, '/hunt', 4096]]) {
    const body = { artist: '春'.repeat(Math.ceil(size / 3)) };
    for (const preparsed of [false, true]) {
      const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url, method: 'POST', headers: {} });
      if (preparsed) req.body = body;
      const res = response(); await handler(req, res);
      expect(res.statusCode).toBe(413);
    }
  }
});
it('manifest skips invalid records and indexes valid neighbors with mocked filesystem', () => {
  const valid = { id: 'test-song', title: 'Song', artist: 'Someone', body: 'C G Am F', tuning: 'standard', tuningSource: 'meta', format: 'chords' };
  vi.spyOn(fs, 'readdirSync').mockImplementation(dir => dir === '/virtual' ? ['test'] : ['invalid.json', 'null.json', 'valid.json']);
  vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true });
  vi.spyOn(fs, 'readFileSync').mockImplementation(file => JSON.stringify(file.endsWith('invalid.json') ? { ...valid, artist: 123 } : file.endsWith('null.json') ? null : valid));
  const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(buildManifest('/virtual').map(row => row.id)).toEqual(['test-song']);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0]).toBe('/virtual/manifest.json');
});
it('selects native curl on Unix and Windows', () => {
  expect(curlBinary('linux')).toBe('curl');
  expect(curlBinary('darwin')).toBe('curl');
  expect(curlBinary('win32')).toBe('curl.exe');
});

it('ingestion writes split UTF-8 metadata unchanged using mocked storage', async () => {
  const body = { id: 'test-song', source: 'test', title: '春', artist: 'B♭', body: 'F♯ C♯' };
  const res = response();
  await ingest(request('/song', body), res);
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(writeFile.mock.calls[0][1])).toEqual(body);
});
