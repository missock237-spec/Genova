import { execSync, spawn } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

const PG_INSTALL = '/home/z/my-project/pg-install';
const PG_DATA = '/home/z/my-project/data/pg';
const PG_LOG = join(PG_DATA, 'server.log');
const PG_PORT = 5432;
const PG_USER = 'genova';
const PG_PASSWORD = 'genova_secret';
const PG_DATABASE = 'genova';

const LD_LIBRARY_PATH = `${PG_INSTALL}/lib:${process.env.LD_LIBRARY_PATH || ''}`;

function isServerRunning(): boolean {
  try {
    execSync(`pg_isready -h localhost -p ${PG_PORT} 2>/dev/null`, {
      env: { ...process.env, LD_LIBRARY_PATH, PATH: `${PG_INSTALL}/bin:${process.env.PATH}` },
    });
    return true;
  } catch {
    return false;
  }
}

function waitForServer(maxRetries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const interval = setInterval(() => {
      if (isServerRunning()) {
        clearInterval(interval);
        resolve();
      }
      retries++;
      if (retries >= maxRetries) {
        clearInterval(interval);
        reject(new Error('PostgreSQL server did not start within timeout'));
      }
    }, 1000);
  });
}

async function setupDatabase(): Promise<void> {
  // Dynamic import of pg
  const { Client } = await import('pg');

  const client = new Client({
    host: 'localhost',
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: 'postgres',
  });

  await client.connect();

  // Create the genova database
  try {
    await client.query(`CREATE DATABASE ${PG_DATABASE}`);
    console.log(`Database "${PG_DATABASE}" created`);
  } catch (e: any) {
    if (e.code === '42P04') {
      console.log(`Database "${PG_DATABASE}" already exists`);
    } else {
      throw e;
    }
  }

  await client.end();
}

async function main(): Promise<void> {
  console.log('PostgreSQL Service starting...');

  // Check if data directory exists
  if (!existsSync(join(PG_DATA, 'PG_VERSION'))) {
    console.log('Initializing PostgreSQL data directory...');
    mkdirSync(PG_DATA, { recursive: true });

    // Create password file
    const pwFile = join('/tmp', 'pg-pwfile.txt');
    writeFileSync(pwFile, PG_PASSWORD + '\n');

    try {
      execSync(
        `${PG_INSTALL}/bin/initdb -D ${PG_DATA} --auth=md5 --username=${PG_USER} --pwfile=${pwFile}`,
        {
          env: { ...process.env, LD_LIBRARY_PATH },
          stdio: 'inherit',
        }
      );
      console.log('PostgreSQL data directory initialized');
    } finally {
      // Clean up password file
      try {
        unlinkSync(pwFile);
      } catch {}
    }
  }

  // Start the PostgreSQL server if not already running
  if (!isServerRunning()) {
    console.log('Starting PostgreSQL server...');
    const pgProcess = spawn(
      PG_INSTALL + '/bin/postgres',
      ['-D', PG_DATA, '-p', PG_PORT.toString()],
      {
        env: { ...process.env, LD_LIBRARY_PATH },
        stdio: 'pipe',
      }
    );

    pgProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString('utf-8');
      console.log('[PG]', msg.trim());
    });

    pgProcess.on('exit', (code) => {
      console.log(`PostgreSQL process exited with code ${code}`);
      process.exit(code || 0);
    });

    // Wait for server to be ready
    try {
      await waitForServer();
      console.log('PostgreSQL server is ready');
    } catch (err) {
      console.error('Failed to start PostgreSQL:', err);
      process.exit(1);
    }

    // Setup database
    await setupDatabase();
  } else {
    console.log('PostgreSQL server is already running');
  }

  console.log(`PostgreSQL service ready at localhost:${PG_PORT}`);
  console.log(`Database: ${PG_DATABASE}, User: ${PG_USER}`);

  // Keep process alive
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  console.error('Failed to start PostgreSQL service:', err);
  process.exit(1);
});
