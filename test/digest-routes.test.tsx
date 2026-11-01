import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight, DigestRow } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

type DigestJson = DigestNight & { night: string };

const line = (job: string, status: string, owner: string | null, at: string, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

describe('digest routes on a temp runs dir', () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      [
        line('b/flaky', 'retry', 'rook', '2026-01-01T01:00:00+01:00', 'upstream 503'),
        line('b/flaky', 'retry', 'rook', '2026-01-01T01:01:00+01:00', 'upstream 503'),
        line('b/flaky', 'retry', 'rook', '2026-01-01T01:02:00+01:00', 'upstream 503'),
        line('b/flaky', 'ok', 'rook', '2026-01-01T01:03:00+01:00'),
        line('a/broken', 'fail', null, '2026-01-01T02:00:00+01:00', 'quota exceeded'),
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [line('c/fine', 'ok', 'rook', '2026-01-03T01:00:00+01:00'), '{"at":', ''].join('\n'),
    );
    app = createApp({ ...base, runsDir: dir });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders a night with 200, rows sorted by job, marks and dashes', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const broken = html.indexOf('<td>a/broken</td>');
    const flaky = html.indexOf('<td>b/flaky</td>');
    expect(broken).toBeGreaterThan(-1);
    expect(flaky).toBeGreaterThan(broken);
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('<td class="mute">—</td>');
    expect(html).toContain('2026-01-01T02:00:00+01:00');
  });

  it('returns the same night as JSON', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    const body = (await res.json()) as DigestJson;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['a/broken', 'b/flaky']);
    expect(body.rows[0].owner).toBeNull();
    expect(body.counts).toEqual({ ok: 1, retry: 3, fail: 1 });
  });

  it('returns 404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-02-01')).status).toBe(404);
    expect((await app.request('/api/digest/2026-02-01')).status).toBe(404);
  });

  it('returns 404 for a night name that is not a date', async () => {
    expect((await app.request('/digest/not-a-night')).status).toBe(404);
    expect((await app.request('/api/digest/not-a-night')).status).toBe(404);
  });

  it('renders an empty night as "nothing ran"', async () => {
    const page = await app.request('/digest/2026-01-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const json = await app.request('/api/digest/2026-01-02');
    expect(json.status).toBe(200);
    expect(((await json.json()) as DigestJson).rows).toEqual([]);
  });

  it('still renders a night with a bad line and counts it', async () => {
    const page = await app.request('/digest/2026-01-03');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('<td>c/fine</td>');
    expect(html).toContain('1 unreadable line(s) skipped');
    const body = (await (await app.request('/api/digest/2026-01-03')).json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('digest on runs/', () => {
  const app = createApp({ ...base, runsDir: 'runs' });

  it('JSON for 2026-10-28 has the same jobs, in the same order, as the page', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as { rows: DigestRow[] };
    const positions = body.rows.map((r) => html.indexOf(`<td>${r.job}</td>`));
    expect(body.rows).toHaveLength(5);
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('board links every night on disk to a digest that renders, with counts', async () => {
    const board = await (await app.request('/')).text();
    expect(board).toContain('ok 10 · retry 4');
    for (const night of ['2026-10-28', '2026-10-27']) {
      expect(board).toContain(`href="/digest/${night}"`);
      expect((await app.request(`/digest/${night}`)).status).toBe(200);
    }
  });
});
