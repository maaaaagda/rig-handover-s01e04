import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RigConfig } from './config.js';
import { lineStatus } from './digest/read-night.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightCounts = {
  night: string;
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightCounts[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function countNight(runsDir: string, night: string): Promise<Pick<NightCounts, 'ok' | 'retry' | 'fail'>> {
  const text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    const status = lineStatus(raw);
    if (status) counts[status]++;
  }
  return counts;
}

export async function readStatus(config: RigConfig): Promise<Status> {
  const nights = await Promise.all(
    nightsOnDisk(config.runsDir).map(async (night) => ({
      night,
      ...(await countNight(config.runsDir, night)),
    })),
  );
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
