// W-03 auto-refresh (02 §W-03): a task created while the list is open shows up marked "新着" without a reload.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const dev = JSON.parse(readFileSync(new URL("../.data/dev.json", import.meta.url), "utf8")) as {
  api_key: string;
  principal_id: string;
};

test("a new task appears on the open list within one refresh and is marked new", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const { invite_code } = (await (await request.post("/api/dev/invite")).json()) as { invite_code: string };
  await page.goto("/tasks");
  await page.getByLabel("開発モード: 名前を入れてログイン").fill(`rf${Date.now() % 1_000_000}`);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("招待コード").fill(invite_code);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "登録して始める" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByText("開いている間は30秒ごとに自動で更新します")).toBeVisible();

  const question = `Is this shop open right now? (refresh ${Date.now()})`;
  const created = await request.post("/v1/verifications", {
    headers: { authorization: `Bearer ${dev.api_key}`, "idempotency-key": `e2e-rf-${Date.now()}` },
    data: {
      type: "PLACE_STATUS_VERIFICATION",
      question,
      answer_schema: { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] },
      location: { lat: 35.6595, lng: 139.7005, radius_m: 80 },
      deadline: new Date(Date.now() + 50 * 60_000).toISOString(),
      freshness: { max_age_seconds: 300 },
      evidence_requirements: { photo: true, task_nonce: true },
      assurance: { required_witnesses: 1, quorum: 1 },
      bounty: { asset: "USDC", amount: "0.50", network: "solana-devnet" },
      principal_ref: dev.principal_id,
    },
  });
  expect(created.status()).toBe(201);
  const { verification_id: id } = (await created.json()) as { verification_id: string };
  // Funding (FAKE chain) moves the task to OPEN shortly after creation.
  await expect
    .poll(async () => {
      const r = await request.get(`/v1/verifications/${id}`, {
        headers: { authorization: `Bearer ${dev.api_key}` },
      });
      return ((await r.json()) as { status: string }).status;
    })
    .toBe("OPEN");

  await expect(page.getByText(question)).toHaveCount(0);
  await page.clock.fastForward(31_000);
  const card = page.locator("a", { hasText: question });
  await expect(card).toBeVisible();
  await expect(card.getByText("新着")).toBeVisible();
  await expect(page.getByText(/新しいタスクが \d+ 件届きました/)).toBeVisible();

  // Leave the shared dev list as it was.
  const cancelled = await request.post(`/v1/verifications/${id}/cancel`, {
    headers: { authorization: `Bearer ${dev.api_key}` },
  });
  expect(cancelled.ok()).toBe(true);
});
