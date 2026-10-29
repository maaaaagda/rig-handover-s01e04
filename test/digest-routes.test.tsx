import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

function appConfig(runsDir: string): RigConfig {
  return {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
}

async function tempRuns(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rig-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body);
  }
  return dir;
}

function line(job: string, at = '2026-10-29T01:00:00+01:00'): string {
  return JSON.stringify({ at, job, status: 'ok', owner: 'ada' });
}

function jobsOnPage(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody?.[1]) return [];
  return [...tbody[1].matchAll(/<tr\b[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

type DigestBody = { rows: { job: string }[]; badLines: number };

const NIGHT = '2026-10-28';

describe('digest routes', () => {
  it('returns 200 and lists the same jobs in the same order on the page and the JSON', async () => {
    const dir = await tempRuns({
      [`${NIGHT}.jsonl`]: [line('zeta'), line('alpha', '2026-10-29T02:00:00+01:00'), line('mid')].join('\n'),
    });
    const app = createApp(appConfig(dir));

    const page = await app.request(`/digest/${NIGHT}`);
    const json = await app.request(`/api/digest/${NIGHT}`);
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);

    const body = (await json.json()) as DigestBody;
    const jobs = body.rows.map((row) => row.job);
    expect(jobs).toEqual(['alpha', 'mid', 'zeta']);
    expect(jobsOnPage(await page.text())).toEqual(jobs);
  });

  it('returns 404 when the night has no file', async () => {
    const app = createApp(appConfig(await tempRuns({})));
    expect((await app.request(`/digest/${NIGHT}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${NIGHT}`)).status).toBe(404);
  });

  it('says nothing ran for an empty night and returns empty rows', async () => {
    const app = createApp(appConfig(await tempRuns({ [`${NIGHT}.jsonl`]: '' })));

    const page = await app.request(`/digest/${NIGHT}`);
    const json = await app.request(`/api/digest/${NIGHT}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(((await json.json()) as DigestBody).rows).toEqual([]);
  });

  it('stays 200 when a line is bad and reports badLines 1', async () => {
    const app = createApp(
      appConfig(await tempRuns({ [`${NIGHT}.jsonl`]: [line('zeta'), 'not json', line('alpha')].join('\n') })),
    );

    const page = await app.request(`/digest/${NIGHT}`);
    const json = await app.request(`/api/digest/${NIGHT}`);
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);

    const body = (await json.json()) as DigestBody;
    expect(body.badLines).toBe(1);
    expect(jobsOnPage(await page.text())).toEqual(body.rows.map((row) => row.job));
  });

  it('returns 404 when the night is not a date', async () => {
    const app = createApp(appConfig(await tempRuns({ 'yesterday.jsonl': line('alpha') })));
    expect((await app.request('/digest/yesterday')).status).toBe(404);
    expect((await app.request('/api/digest/yesterday')).status).toBe(404);
  });
});
