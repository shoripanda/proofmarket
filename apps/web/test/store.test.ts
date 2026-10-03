// Reports from shops (01 §4.13): secret link, default expiry, requester context only, never decides or reaches workers.
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { fileReport, issuePlaceToken, revokePlaceToken, storeInfo } from "../lib/services/store-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>; // Fri 2026-10-09 12:00 JST
let token: string;
let tokenId: string;
beforeEach(async () => {
  t = await createTestApp();
  ({ token, tokenId } = await issuePlaceToken(t.db, t.placeId, "test"));
});
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe("reports from shops", () => {
  it("files a report that lasts until the end of the JST day; bad or revoked links are refused", async () => {
    expect(await storeInfo(t.app, token)).toMatchObject({ place_name: "test shop", current: null });
    const r = await fileReport(t.app, token, { status: "CLOSED_TODAY", note: "設備点検" });
    expect(r.current).toMatchObject({ status: "CLOSED_TODAY", valid_until: "2026-10-09T15:00:00.000Z" });
    expect(JSON.stringify(r)).not.toContain("設備点検");
    expect(
      await err(fileReport(t.app, token, { status: "CLOSED_TODAY", valid_until: "2026-10-30T00:00:00Z" })),
    ).toBe("VALIDATION_FAILED");
    expect(await err(storeInfo(t.app, "nope"))).toBe("UNAUTHENTICATED");
    await revokePlaceToken(t.db, tokenId, t.app.now());
    expect(await err(fileReport(t.app, token, { status: "OPEN_AS_USUAL" }))).toBe("UNAUTHENTICATED");
  });

  it("requesters see it next to the result; it does not decide the answer and workers never see it", async () => {
    const alice = (await onboardWorker(t, "alice")).token;
    await fileReport(t.app, token, { status: "CLOSED_TODAY" });
    const id = await openTask(t);
    expect(JSON.stringify(await (await W(t, alice).list()).json())).not.toContain("CLOSED_TODAY");
    await witness(t, alice, id, { answer: "OPEN" });
    const v = (await (
      await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
    ).json()) as { store_report: { status: string }; result: { answer: string } };
    expect(v.store_report).toMatchObject({ status: "CLOSED_TODAY" });
    expect(v.result.answer).toBe("OPEN");
  });
});
