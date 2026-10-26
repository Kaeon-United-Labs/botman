const path = require('path');
const express = require('express');
const { config, validate } = require('./lib/config');
const log = require('./lib/log');
const agent = require('./lib/agent');

const toMessage = (o) => ({
  index: o.index,
  author: o.properties.metadata.author,
  content: o.content,
  time: o.properties.metadata.time,
});

// Tiny in-memory per-IP sliding window limiter for user messages.
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= config.rateLimitPerMin) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

async function main() {
  validate();
  await log.connect();

  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Poll endpoint. Doubles as the frontend heartbeat.
  app.get('/api/thread', async (req, res) => {
    try {
      agent.ping();
      const after = Math.max(0, parseInt(req.query.after, 10) || 0);
      const docs = await log.threadAfter(after);
      res.json({ messages: docs.map(toMessage), thinking: agent.isThinking() });
    } catch (e) {
      console.error('[thread]', e.message);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.post('/api/message', async (req, res) => {
    try {
      agent.ping();
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (!content) return res.status(400).json({ error: 'empty message' });
      if (content.length > config.maxMessageChars) {
        return res.status(400).json({ error: `max ${config.maxMessageChars} characters` });
      }
      if (!allowed(req.ip)) return res.status(429).json({ error: 'slow down' });
      // Author and visibility are forced server-side; clients cannot choose them.
      const obj = await log.appendNote({ author: 'user', content, visible: true });
      res.json({ message: toMessage(obj) });
    } catch (e) {
      console.error('[message]', e.message);
      res.status(500).json({ error: 'server error' });
    }
  });

  const server = app.listen(config.port, () => {
    console.log(`botman listening on http://localhost:${config.port} (${config.aiProvider})`);
    agent.start();
  });

  const shutdown = async () => {
    agent.stop();
    server.close();
    await log.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
