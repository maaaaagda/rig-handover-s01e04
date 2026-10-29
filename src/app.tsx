import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { digestApi } from './digest/api.js';
import { readNight } from './digest/read-night.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Digest } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT';
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', async (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={await readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    if (!NIGHT.test(night)) return c.notFound();
    try {
      const { rows } = await readNight(config.runsDir, night);
      return c.html(
        <Layout title="digest" lane={lane()}>
          <Digest night={night} rows={rows} />
        </Layout>,
      );
    } catch (err) {
      if (isEnoent(err)) return c.notFound();
      throw err;
    }
  });

  app.route('/api/digest', digestApi(config));

  return app;
}
