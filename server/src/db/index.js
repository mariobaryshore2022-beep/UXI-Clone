const { Pool } = require('pg');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

let pool = null;
let pgliteInstance = null;
let isPglite = false;

async function getDb() {
  if (pool) return { type: 'pg', client: pool };
  if (pgliteInstance) return { type: 'pglite', client: pgliteInstance };

  const dbUrl = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;

  if (dbUrl || pgHost) {
    try {
      console.log('Connecting to PostgreSQL server...');
      const testPool = new Pool({
        connectionString: dbUrl,
        host: pgHost || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'pulse_db',
        connectionTimeoutMillis: 3000,
      });

      // Quick connectivity check
      await testPool.query('SELECT 1');
      console.log('Connected successfully to native PostgreSQL database.');
      pool = testPool;
      return { type: 'pg', client: pool };
    } catch (err) {
      console.warn('Native PostgreSQL not reachable (' + err.message + '). Falling back to embedded PGlite WASM engine...');
    }
  }

  // Fallback / Default: Embedded PGlite (PostgreSQL WASM Engine)
  console.log('Initializing embedded PostgreSQL (PGlite) engine...');
  const dataDir = path.join(__dirname, '../../../.data/pglite');
  fs.mkdirSync(dataDir, { recursive: true });

  // Clean stale lockfile if previous process was abruptly killed
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try { fs.unlinkSync(pidFile); } catch {}
  }

  try {
    pgliteInstance = new PGlite(dataDir);
    await pgliteInstance.waitReady;
  } catch (err) {
    console.warn('PGlite dir recovery needed (' + err.message + '). Reinitializing database...');
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
    pgliteInstance = new PGlite(dataDir);
    await pgliteInstance.waitReady;
  }

  isPglite = true;
  console.log('Embedded PostgreSQL (PGlite) ready at ' + dataDir);
  return { type: 'pglite', client: pgliteInstance };
}

async function query(text, params = []) {
  const { type, client } = await getDb();
  if (type === 'pg') {
    return await client.query(text, params);
  } else {
    // PGlite query
    return await client.query(text, params);
  }
}

async function initDb() {
  const { type, client } = await getDb();
  console.log(`Running database migrations (${type})...`);
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (type === 'pg') {
    await client.query(schemaSql);
  } else {
    await client.exec(schemaSql);
  }
  console.log('Database schema successfully synchronized.');
}

module.exports = {
  getDb,
  query,
  initDb,
  isEmbedded: () => isPglite
};
