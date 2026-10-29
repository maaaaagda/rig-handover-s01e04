import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

async function night(content: string) {
  const dir = await mkdtemp(join(tmpdir(), 'rig-'));
  await writeFile(join(dir, 'n.jsonl'), content);
  return dir;
}

describe('readNight', () => {
  it('reads the real night: 5 jobs, 1 bad line', async () => {
    const { rows, badLines } = await readNight('runs', '2026-10-28');
    expect(badLines).toBe(1);
    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const fx = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(fx).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(fx.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(fx.lastAt).toBe('2026-10-29T01:37:00+01:00');
    const nb = rows.find((r) => r.job === 'notes/backup')!;
    expect(nb).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
  });

  it('keeps a row with null owner', async () => {
    const dir = await night('{"at":"2026-10-29T01:00:00+01:00","job":"a","status":"ok","owner":null}\n');
    const { rows, badLines } = await readNight(dir, 'n');
    expect(badLines).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.owner).toBeNull();
  });

  it('returns nothing for an empty file', async () => {
    const dir = await night('');
    expect(await readNight(dir, 'n')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts bad lines and does not throw', async () => {
    const dir = await night(
      [
        '{"at":"2026-10-29T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        'not json',
        '{"at":"2026-10-29T02:00:00+01:00","status":"ok","owner":"x"}',
        '{"job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-10-29T02:00:00+01:00","job":"a","owner":"x"}',
      ].join('\n'),
    );
    const { rows, badLines } = await readNight(dir, 'n');
    expect(badLines).toBe(4);
    expect(rows).toHaveLength(1);
  });

  it('picks latest by at, not by line order', async () => {
    const dir = await night(
      [
        '{"at":"2026-10-29T03:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
        '{"at":"2026-10-29T01:00:00+01:00","job":"a","status":"retry","owner":"x"}',
      ].join('\n'),
    );
    const { rows } = await readNight(dir, 'n');
    expect(rows[0]).toMatchObject({ lastStatus: 'fail', lastError: 'boom', retries: 1, firstAt: '2026-10-29T01:00:00+01:00' });
  });

  it('rejects with ENOENT for a missing night', async () => {
    await expect(readNight('runs', '1999-01-01')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
