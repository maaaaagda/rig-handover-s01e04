import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, NightRead, RunStatus } from './types.js';

type Line = { at: string; ms: number; job: string; status: RunStatus; owner: string | null; error: string | null };

const STATUSES = new Set<string>(['ok', 'retry', 'fail']);

function parseLine(raw: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (typeof o.status !== 'string' || !STATUSES.has(o.status)) return null;
  if (typeof o.at !== 'string') return null;
  const ms = Date.parse(o.at);
  if (Number.isNaN(ms)) return null;
  return {
    at: o.at,
    ms,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

export function lineStatus(raw: string): RunStatus | null {
  return parseLine(raw)?.status ?? null;
}

// A missing night file rejects with the original fs error (code 'ENOENT') so routes can answer 404.
export async function readNight(runsDir: string, night: string): Promise<NightRead> {
  const text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  const byJob = new Map<string, Line[]>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }
  const rows: DigestRow[] = [];
  for (const [job, lines] of byJob) {
    const sorted = [...lines].sort((a, b) => a.ms - b.ms);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    rows.push({
      job,
      owner: last.owner,
      runs: lines.length,
      retries: lines.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError: last.error,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}
