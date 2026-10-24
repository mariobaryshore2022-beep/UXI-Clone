require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const { seedData } = require('./db/seed');
const apiRoutes = require('./routes/api');
const { sseHandler } = require('./routes/sse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve Dashboard Frontend (disable caching so edits and JS updates reflect instantly)
const dashboardPath = path.join(__dirname, '../../dashboard');
app.use(express.static(dashboardPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// API & Realtime SSE
app.use('/api', apiRoutes);
app.get('/api/events', sseHandler);

// Fallback to dashboard SPA for client-side navigation
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

const { startProberLoop } = require('./engine/proberEngine');

async function startServer() {
  try {
    console.log('--- Pulse UX Hub Server Starting ---');
    await initDb();
    await seedData();

    // Start Real-Time Synthetic Prober Loop (probes web, DNS, TCP targets and evaluates health)
    startProberLoop(25000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Pulse UX Hub listening on http://0.0.0.0:${PORT}`);
      console.log(`Pulse UX Hub Dashboard live at http://localhost:${PORT}`);
      console.log(`Realtime SSE endpoint: http://localhost:${PORT}/api/events`);
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
