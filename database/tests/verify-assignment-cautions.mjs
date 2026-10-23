import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Disposable PostgreSQL only: no host port, host volume, or customer DB connection.
const name = `laborflow-caution-test-${randomUUID()}`;
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 60000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
const sql = text => docker(["exec", "-i", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], text);
const ids = [1, 2, 3, 4, 5, 6, 7].map(n => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const [office, foreignOffice, account, worker, client, foreignWorker, day] = ids;
const migration = readFileSync(new URL("../migrations/035_create_assignment_cautions.sql", import.meta.url), "utf8");
const dao = readFileSync(new URL("../../backend-core/src/main/java/com/laborflow/core/cautions/dao/JdbcAssignmentCautionDao.java", import.meta.url), "utf8");
const scheduleDao = readFileSync(new URL("../../backend-core/src/main/java/com/laborflow/core/schedule/dao/JdbcScheduleDao.java", import.meta.url), "utf8");
const createSql = dao.match(/INSERT INTO public\.worker_client_assignment_caution[\s\S]*?DO NOTHING RETURNING uuid/)[0];
const quote = value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const insert = (requester, memo, workerId = worker) => {
  const values = [office, workerId, client, requester, memo, account, account];
  let index = 0;
  return sql(createSql.replace(/\?/g, () => quote(values[index++])) + ";");
};
let created = false;
try {
  docker(["run", "--detach", "--pull", "never", "--name", name, "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:18"]);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { docker(["exec", name, "pg_isready", "-U", "postgres"]); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(ready, "isolated PostgreSQL must be ready");
  sql(`
    CREATE TABLE public.labor_agency_owner (uuid uuid PRIMARY KEY);
    CREATE TABLE public.app_account (uuid uuid PRIMARY KEY);
    CREATE TABLE public.labor_agency_worker_profile (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL, UNIQUE(agency_owner_uuid, uuid));
    CREATE TABLE public.labor_agency_farm_owner_profile (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL);
    CREATE TABLE public.farm_work_site (uuid uuid PRIMARY KEY, agency_owner_uuid uuid NOT NULL, deleted_at timestamptz);
    CREATE TABLE public.work_schedule_day (uuid uuid PRIMARY KEY, work_site_uuid uuid, work_date date, deleted_at timestamptz);
    CREATE TABLE public.work_schedule_assignment (uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_day_uuid uuid,
      agency_owner_uuid uuid, worker_profile_uuid uuid, participant_type varchar(16), status varchar(16),
      worker_count int, deleted_at timestamptz, updated_at timestamptz DEFAULT now(), marker text);
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    INSERT INTO public.labor_agency_owner VALUES ('${office}'), ('${foreignOffice}');
    INSERT INTO public.app_account VALUES ('${account}');
    INSERT INTO public.labor_agency_worker_profile VALUES ('${worker}', '${office}'), ('${foreignWorker}', '${foreignOffice}');
    INSERT INTO public.labor_agency_farm_owner_profile VALUES ('${client}', '${office}');
    INSERT INTO public.work_schedule_day VALUES ('${day}');
  `);
  sql(migration);
  const original = insert("CLIENT", "가상 관찰 메모\n두 번째 줄");
  assert.match(original, /^[a-f0-9-]{36}$/);
  const version = sql(`SELECT updated_at FROM worker_client_assignment_caution WHERE uuid='${original}';`);
  assert.equal(insert("BOTH", "중복 입력"), "", "duplicate INSERT must not change the existing row");
  assert.equal(sql(`SELECT count(*) FROM worker_client_assignment_caution WHERE deleted_at IS NULL;`), "1");
  assert.equal(sql(`SELECT requested_by FROM worker_client_assignment_caution WHERE uuid='${original}';`), "CLIENT");
  assert.equal(sql(`SELECT updated_at FROM worker_client_assignment_caution WHERE uuid='${original}';`), version);
  assert.throws(() => insert("WORKER", null, foreignWorker), /foreign key constraint/);
  assert.throws(() => sql(`UPDATE worker_client_assignment_caution SET requested_by='BAN' WHERE uuid='${original}';`), /check constraint/);
  assert.equal(sql(`UPDATE worker_client_assignment_caution SET memo=NULL, requested_by='WORKER' WHERE uuid='${original}'; SELECT memo IS NULL FROM worker_client_assignment_caution WHERE uuid='${original}';`).split("\n").at(-1), "t");
  assert.equal(sql(`UPDATE worker_client_assignment_caution SET requested_by='BOTH' WHERE uuid='${original}'; SELECT updated_at > '${version}'::timestamptz FROM worker_client_assignment_caution WHERE uuid='${original}';`).split("\n").at(-1), "t");
  sql(`INSERT INTO assignment_caution_acknowledgement (agency_owner_uuid,caution_uuid,caution_updated_at,schedule_day_uuid,acknowledged_by_account_uuid,action)
    SELECT '${office}', uuid, updated_at, '${day}', '${account}', 'ASSIGNMENT_SAVE' FROM worker_client_assignment_caution WHERE uuid='${original}';`);
  assert.throws(() => sql(`DELETE FROM worker_client_assignment_caution WHERE uuid='${original}';`), /foreign key constraint/);
  sql(`UPDATE worker_client_assignment_caution SET deleted_at=now() WHERE uuid='${original}';`);
  const reRegistered = insert("WORKER", null);
  assert.notEqual(reRegistered, original);
  assert.equal(sql(`SELECT count(*) FROM worker_client_assignment_caution;`), "2");
  assert.equal(sql(`SELECT count(*) FROM worker_client_assignment_caution WHERE deleted_at IS NULL;`), "1");
  sql(`BEGIN; UPDATE worker_client_assignment_caution SET memo='저장하지 않은 가상 메모' WHERE uuid='${reRegistered}'; ROLLBACK;`);
  assert.equal(sql(`SELECT memo IS NULL FROM worker_client_assignment_caution WHERE uuid='${reRegistered}';`), "t");
  const sourceDay = "70000000-0000-4000-8000-000000000001";
  const site = "80000000-0000-4000-8000-000000000001";
  sql(`INSERT INTO farm_work_site VALUES ('${site}', '${office}', NULL);
    UPDATE work_schedule_day SET work_site_uuid='${site}', work_date='2026-10-11' WHERE uuid='${day}';
    INSERT INTO work_schedule_day VALUES ('${sourceDay}', '${site}', '2026-10-11', NULL);
    INSERT INTO work_schedule_assignment (schedule_day_uuid,agency_owner_uuid,worker_profile_uuid,participant_type,status,worker_count,marker) VALUES
      ('${sourceDay}','${office}','${worker}','REGISTERED','PLANNED',2,'source-moved'),
      ('${sourceDay}','${office}','${foreignWorker}','REGISTERED','WORKED',9,'source-unrelated'),
      ('${sourceDay}','${office}','${worker}','REGISTERED','REPLACED',1,'source-replaced'),
      ('${sourceDay}','${office}',NULL,'GUEST','PLANNED',3,'source-guest'),
      ('${day}','${office}','${worker}','REGISTERED','PLANNED',2,'target'),
      ('${sourceDay}','${foreignOffice}','${worker}','REGISTERED','PLANNED',2,'foreign-office');`);
  const transfer = scheduleDao.match(/UPDATE public\.work_schedule_assignment a[\s\S]*?AND a\.worker_profile_uuid IN \(%s\)/)[0].replace("%s", "?");
  let index = 0;
  const values = [office, day, "2026-10-11", worker];
  sql(transfer.replace(/\?/g, () => quote(values[index++])) + ";");
  assert.equal(sql("SELECT marker FROM work_schedule_assignment WHERE deleted_at IS NOT NULL;"), "source-moved");
  assert.equal(sql("SELECT status || ':' || worker_count FROM work_schedule_assignment WHERE marker='source-unrelated';"), "WORKED:9");
  assert.equal(sql("SELECT count(*) FROM work_schedule_assignment WHERE deleted_at IS NULL;"), "5");
  console.log("PASS: migration 035, DAO duplicate INSERT, requester/memo checks, office FK, timestamp, release/re-register, acknowledgement retention, SQL rollback, targeted transfer preserving unrelated/guest/replaced/foreign/target assignments");
} finally {
  if (created) docker(["rm", "--force", "--volumes", name]);
}
