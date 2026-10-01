// F5: boot-time refusal of unsafe configuration (DEV_AUTH in a deployed
// environment, or a real database without JWT_SECRET).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('F5: configErrors flags DEV_AUTH outside local dev and a database without JWT_SECRET', async () => {
  const { configErrors } = await import('../src/config.js');
  const PG = 'postgres://u:p@db.example/gk';

  // OK: local dev (PGlite), local dev with the test harness's empty DATABASE_URL, production done right.
  assert.deepEqual(configErrors({ DEV_AUTH: '1' }), []);
  assert.deepEqual(configErrors({ DEV_AUTH: '1', DATABASE_URL: '', JWT_SECRET: 's' }), []);
  assert.deepEqual(configErrors({ DATABASE_URL: PG, JWT_SECRET: 's' }), []);
  assert.deepEqual(configErrors({ DATABASE_URL: PG, JWT_SECRET: 's', DEV_AUTH: '0' }), []);
  assert.deepEqual(configErrors({ AWS_LAMBDA_FUNCTION_NAME: 'gk-api', DATABASE_URL: PG, JWT_SECRET: 's' }), []);

  // DEV_AUTH=1 with a real database, or on Lambda.
  const withDb = configErrors({ DEV_AUTH: '1', DATABASE_URL: PG, JWT_SECRET: 's' });
  assert.equal(withDb.length, 1);
  assert.match(withDb[0], /DEV_AUTH=1/);
  assert.match(withDb[0], /DATABASE_URL/);
  const onLambda = configErrors({ DEV_AUTH: '1', AWS_LAMBDA_FUNCTION_NAME: 'gk-api' });
  assert.equal(onLambda.length, 1);
  assert.match(onLambda[0], /AWS_LAMBDA_FUNCTION_NAME/);

  // A real database without JWT_SECRET (empty counts as unset).
  for (const env of [{ DATABASE_URL: PG }, { DATABASE_URL: PG, JWT_SECRET: '' }]) {
    const errs = configErrors(env);
    assert.equal(errs.length, 1, JSON.stringify(env));
    assert.match(errs[0], /JWT_SECRET/);
  }
  // Both problems at once are both reported.
  assert.equal(configErrors({ DEV_AUTH: '1', DATABASE_URL: PG }).length, 2);
});

/** Run node in api/ with ONLY the given env (+PATH); resolve { code, signal, out } or kill after `ms`. */
function runNode(args, env, { ms = 8000, until } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: apiDir,
      // Empty strings (not absent) so dotenv can never fill them from an api/.env.
      env: { PATH: process.env.PATH, DATABASE_URL: '', JWT_SECRET: '', DEV_AUTH: '', AWS_LAMBDA_FUNCTION_NAME: '', LOG_REQUESTS: '0', ...env },
    });
    let out = '';
    let timedOut = false;
    const onData = (b) => {
      out += b;
      if (until && until.test(out)) child.kill('SIGTERM');
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, ms);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out, timedOut });
    });
  });
}

const PORT = String(40000 + Math.floor(Math.random() * 20000));

test('F5: `node src/server.js` refuses to start with DEV_AUTH=1 and a DATABASE_URL', async () => {
  const r = await runNode(['src/server.js'], { DEV_AUTH: '1', DATABASE_URL: 'postgres://x/y', JWT_SECRET: 's', PORT });
  assert.equal(r.timedOut, false, `server kept running instead of refusing:\n${r.out}`);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /refusing to start/i);
  assert.match(r.out, /DEV_AUTH=1/);
  assert.doesNotMatch(r.out, /listening/);
});

test('F5: `node src/server.js` refuses to start with a DATABASE_URL but no JWT_SECRET', async () => {
  const r = await runNode(['src/server.js'], { DATABASE_URL: 'postgres://x/y', PORT });
  assert.equal(r.timedOut, false, `server kept running instead of refusing:\n${r.out}`);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /JWT_SECRET/);
  assert.doesNotMatch(r.out, /listening/);
});

test('F5: on Lambda (app imported, not run) the module throws at init', async () => {
  const r = await runNode(['--input-type=module', '-e', "await import('./src/server.js'); console.log('IMPORTED OK');"], {
    DEV_AUTH: '1',
    AWS_LAMBDA_FUNCTION_NAME: 'gurukhata-api',
    JWT_SECRET: 's',
    PGLITE_DATA_DIR: 'memory://',
  });
  assert.equal(r.timedOut, false);
  assert.notEqual(r.code, 0);
  assert.doesNotMatch(r.out, /IMPORTED OK/);
  assert.match(r.out, /AWS_LAMBDA_FUNCTION_NAME/);
});

test('F5: local dev (DEV_AUTH=1, no DATABASE_URL) still boots', async () => {
  const r = await runNode(['src/server.js'], { DEV_AUTH: '1', PGLITE_DATA_DIR: 'memory://', PORT }, { until: /listening/ });
  assert.equal(r.timedOut, false, r.out);
  assert.match(r.out, /listening/);
  assert.doesNotMatch(r.out, /refusing to start/i);
});
