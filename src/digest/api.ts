import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './read-night.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function digestApi(config: RigConfig) {
  const api = new Hono();

  api.get('/:night', async (c) => {
    const night = c.req.param('night');
    if (!NIGHT.test(night)) return c.json({ error: 'not found' }, 404);
    try {
      const read = await readNight(config.runsDir, night);
      return c.json({ night, rows: read.rows, badLines: read.badLines });
    } catch (err) {
      if (isEnoent(err)) return c.json({ error: 'not found' }, 404);
      throw err;
    }
  });

  return api;
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
