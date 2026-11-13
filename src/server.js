const express = require('express');
const path = require('path');
function createServer(opts = {}) {
  const app = express();

  // Cache parsed data (reparse on demand via refresh endpoint)
  let cachedData = null;

  function friendlyError(err) {
    const msg = err.message || String(err);
    if (err.code === 'ENOENT') return { error: 'Claude Code data directory not found. Have you used Claude Code yet?', code: 'ENOENT' };
    if (err.code === 'EPERM' || err.code === 'EACCES') return { error: 'Permission denied reading Claude Code data. Try running with elevated permissions.', code: err.code };
    return { error: msg };
  }

  app.get('/api/data', async (req, res) => {
    try {
      const { from, to } = req.query;
      const hasFilter = from || to;
      if (!hasFilter && cachedData) {
        return res.json(cachedData);
      }
      const data = await require('./parser').parseAllSessions({ from, to });
      if (!hasFilter) {
        cachedData = data;
      }
      res.json(data);
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  app.get('/api/refresh', async (req, res) => {
    try {
      delete require.cache[require.resolve('./parser')];
      const { from, to } = req.query;
      cachedData = await require('./parser').parseAllSessions({ from, to });
      res.json({ ok: true, sessions: cachedData.sessions.length });
    } catch (err) {
      res.status(500).json(friendlyError(err));
    }
  });

  app.get('/api/version', (req, res) => {
    const pkg = require('../package.json');
    res.json({ version: pkg.version });
  });

  app.get('/api/presets', (req, res) => {
    const now = new Date();
    // Local calendar dates (toISOString would give UTC and be off by a day near midnight)
    const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = day(now);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    res.json({
      today: { from: today, to: today },
      thisWeek: { from: day(startOfWeek), to: today },
      lastWeek: { from: day(startOfLastWeek), to: day(endOfLastWeek) },
      thisMonth: { from: day(startOfMonth), to: today },
      lastMonth: { from: day(startOfLastMonth), to: day(endOfLastMonth) },
      lifetime: {},
    });
  });

  // Keep-alive: each open dashboard page holds one /api/alive connection. When the
  // last one closes (tab/browser closed) and none returns within the grace period,
  // opts.onIdle() fires. Used by --auto-exit.
  let clients = 0;
  let idleTimer = null;
  app.get('/api/alive', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(':ok\n\n');
    clients++;
    app.locals.everConnected = true;
    clearTimeout(idleTimer);
    const ping = setInterval(() => res.write(':\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients--;
      if (clients === 0 && opts.onIdle) {
        // grace period so a page refresh doesn't stop the server
        idleTimer = setTimeout(() => { if (clients === 0) opts.onIdle(); }, opts.idleMs || 5000);
      }
    });
  });

  // Serve static dashboard
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createServer };
