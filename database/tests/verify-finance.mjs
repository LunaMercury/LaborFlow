import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Every write targets this newly-created container. Never read the app's DB configuration.
const token = randomUUID();
const name = `laborflow-finance-test-${token}`;
const database = `lf_finance_${token.replaceAll('-', '')}`;
const repo = fileURLToPath(new URL('../../', import.meta.url));
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 90000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
const sql = content => docker(['exec', '-i', name, 'psql', '-U', 'finance_test', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'], content);
let created = false;
try {
  docker(['run', '--detach', '--pull', 'never', '--name', name,
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=finance_test',
    '--env', 'POSTGRES_PASSWORD=disposable_test_only', '--env', `POSTGRES_DB=${database}`, 'postgres:18']);
  created = true;
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'finance_test', '-d', database]); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 400)); }
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not start.');
  sql(`CREATE TABLE finance_test_marker(token uuid PRIMARY KEY); INSERT INTO finance_test_marker VALUES ('${token}');`);
  sql(readFileSync(new URL('./finance-parent-fixture.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('./no-show-parent-fixture.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('./schedule-charge-parent-fixture.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../migrations/029_create_no_show_response_model.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../migrations/030_extend_no_show_response_history.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../migrations/036_create_finance_ledger.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../migrations/037_extend_no_show_management.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../migrations/038_add_schedule_charge_rates.sql', import.meta.url), 'utf8'));
  if (process.argv.includes('--schema-only')) {
    console.log('PASS: migrations 029/030/036/037/038 applied to a disposable minimal parent schema (no application tests in this mode).');
  } else {
  const mapping = docker(['port', name, '5432/tcp']);
  const port = mapping.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error('Expected an isolated loopback-only PostgreSQL port.');
  const cacheRoot = process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  const buildDir = join(cacheRoot, 'LaborFlow', 'build', 'finance-verify', token);
  const env = { ...process.env, LABORFLOW_CORE_BUILD_DIR: buildDir,
    LABORFLOW_FINANCE_TEST_JDBC_URL: `jdbc:postgresql://127.0.0.1:${port}/${database}`,
    LABORFLOW_FINANCE_TEST_TOKEN: token };
  const command = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const args = process.platform === 'win32' ? ['-ExecutionPolicy', 'Bypass', '-File', '.skills/verify-core.ps1'] : ['.skills/verify-core.sh'];
  const result = spawnSync(command, args, { cwd: repo, env, stdio: 'inherit', timeout: 1200000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Finance/core tests failed.');
  const report = readFileSync(join(buildDir, 'test-results/test/TEST-com.laborflow.core.finance.integration.FinanceLedgerJdbcTest.xml'), 'utf8');
  const suite = report.match(/<testsuite\s[^>]*>/)?.[0] || '';
  if (!/\btests="[1-9][0-9]*"/.test(suite) || !/\bskipped="0"/.test(suite))
    throw new Error('Finance JDBC tests must actually execute, not be skipped or reused from a prior DB.');
  const noShow = readFileSync(join(buildDir, 'test-results/test/TEST-com.laborflow.core.noshow.integration.NoShowJdbcTest.xml'), 'utf8');
  const noShowSuite = noShow.match(/<testsuite\s[^>]*>/)?.[0] || '';
  if (!/\btests="[1-9][0-9]*"/.test(noShowSuite) || !/\bskipped="0"/.test(noShowSuite))
    throw new Error('No-show JDBC tests must actually execute, not be skipped.');
  console.log(`Integration report: ${join(buildDir, 'reports/tests/test/index.html')}`);
  console.log('PASS: migrations 029/030/036/037/038 applied to disposable DB; see finance/no-show/schedule JDBC integration cases in core report.');
  }
} finally {
  if (created) docker(['rm', '--force', '--volumes', name]);
}
