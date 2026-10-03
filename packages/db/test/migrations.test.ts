// Applies drizzle/*.sql to an in-process Postgres (PGlite) and checks the DB-level invariants of
// 04-database-design.md. Runs in CI without Docker.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "../drizzle");
let db: PGlite;

const fails = async (sql: string) => {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

beforeAll(async () => {
  db = new PGlite();
  for (const f of readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join(DIR, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await db.exec(stmt);
    }
  }
  await db.exec(`
    insert into principals(id,type,display_name) values('prn_1','person','t');
    insert into requester_credentials(id,principal_id,requester_name,key_prefix,secret_hash,max_task_amount,daily_spend_limit)
      values('key_1','prn_1','r','abcd1234','\\x01',5,20);
    insert into places(id,name,lat,lng,category,approved_by) values('plc_1','s',35,139,'retail','op');
    insert into verification_requests(id,credential_id,principal_id,type,question,answer_values,target_lat,target_lng,
      place_id,radius_m,deadline,freshness_max_age_s,required_witnesses,quorum,bounty_asset,bounty_amount,bounty_network,
      status,task_id_hash,idempotency_key_hash,request_hash,policy_rule_version)
    values('ver_1','key_1','prn_1','PLACE_STATUS_VERIFICATION','open?','{OPEN,CLOSED}',35,139,'plc_1',80,
      now()+interval '1 hour',300,1,1,'USDC',0.5,'solana-devnet','CREATED','\\x01','\\x02','\\x03','v');`);
});

describe("migrations", () => {
  it("create all 27 tables (24 + 3 OAuth, 05 §6.2) and seed 4 platform flags", async () => {
    const t = await db.query<{ n: number }>(
      "select count(*)::int n from information_schema.tables where table_schema='public'",
    );
    expect(t.rows[0]?.n).toBe(27);
    const f = await db.query<{ n: number }>("select count(*)::int n from platform_flags where value");
    expect(f.rows[0]?.n).toBe(4);
  });

  it("I-SET-03/04 (DB half): settle and refund cannot both be recorded for one task", async () => {
    const ins = (id: string, kind: string) =>
      `insert into payment_records(id,verification_id,kind,asset,amount,network,status)
       values('${id}','ver_1','${kind}','USDC',0.5,'solana-devnet','PENDING')`;
    expect(await fails(ins("pay_1", "FINALIZE_AND_SETTLE"))).toBeNull();
    expect(await fails(ins("pay_2", "REFUND"))).toMatch(/settle_xor_refund/);
  });

  it("RELEASE and REFUND credit-backs are mutually exclusive per task", async () => {
    const ins = (t: string, a: number) =>
      `insert into requester_ledger(credential_id,verification_id,entry_type,amount) values('key_1','ver_1','${t}',${a})`;
    expect(await fails(ins("RELEASE", 0.1))).toBeNull();
    expect(await fails(ins("REFUND", 0.5))).toMatch(/one_credit_back_per_task/);
  });

  it("rejects quorum > required_witnesses and unknown statuses", async () => {
    expect(await fails("update verification_requests set quorum=2 where id='ver_1'")).toMatch(
      /vr_quorum_chk/,
    );
    expect(await fails("update verification_requests set status='DONE' where id='ver_1'")).toMatch(
      /vr_status_chk/,
    );
  });

  it("evidence sha256 is unique across all tasks (REQ-V-004)", async () => {
    const idx = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname='evidence_sha256_unique'",
    );
    expect(idx.rows[0]?.indexdef).toMatch(/UNIQUE INDEX .* \(sha256\)/);
  });

  it("audit_events is append-only", async () => {
    await db.exec(
      "insert into audit_events(actor_type,event_type,correlation_id) values('system','request_created','c1')",
    );
    expect(await fails("update audit_events set event_type='x'")).toMatch(/append-only/);
    expect(await fails("delete from audit_events")).toMatch(/append-only/);
  });
});
