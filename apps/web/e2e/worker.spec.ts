// E-layer (09 §1): the worker screens end to end on a DEV_MODE server with a fake camera and location.
// Fake media is for testing only; demo evidence must come from real people (acceptance-criteria A2).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const dev = JSON.parse(readFileSync(new URL("../.data/dev.json", import.meta.url), "utf8")) as {
  api_key: string;
  principal_id: string;
};

test("login -> onboarding -> claim -> capture -> VALID -> payout -> public result", async ({
  page,
  request,
}) => {
  const deadline = new Date(Date.now() + 50 * 60_000).toISOString();
  const created = await request.post("/v1/verifications", {
    headers: { authorization: `Bearer ${dev.api_key}`, "idempotency-key": `e2e-${Date.now()}` },
    data: {
      type: "PLACE_STATUS_VERIFICATION",
      question: "Is this shop open right now? (e2e)",
      answer_schema: { type: "enum", values: ["OPEN", "CLOSED", "UNCLEAR"] },
      location: { lat: 35.6595, lng: 139.7005, radius_m: 80 },
      deadline,
      freshness: { max_age_seconds: 300 },
      evidence_requirements: { photo: true, task_nonce: true },
      assurance: { required_witnesses: 1, quorum: 1 },
      bounty: { asset: "USDC", amount: "0.50", network: "solana-devnet" },
      principal_ref: dev.principal_id,
    },
  });
  expect(created.status()).toBe(201);
  const { verification_id: id } = (await created.json()) as { verification_id: string };
  const { invite_code } = (await (await request.post("/api/dev/invite")).json()) as { invite_code: string };

  // W-01 login
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("開発モード: 名前を入れてログイン").fill(`e2e${Date.now() % 1_000_000}`);
  await page.getByRole("button", { name: "ログイン" }).click();

  // W-02 onboarding
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("招待コード").fill(invite_code);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "登録して始める" }).click();

  // W-03 list -> W-04 detail
  await expect(page).toHaveURL(/\/tasks$/);
  await page.getByText("Is this shop open right now? (e2e)").first().click();
  await expect(page.getByText("確かめること")).toBeVisible();
  await page.getByRole("button", { name: "引き受ける" }).click();

  // W-05 -> W-06
  await expect(page).toHaveURL(/\/claims\/clm_/);
  await page.getByRole("button", { name: /現地に着いた/ }).click();
  await expect(page.getByText("撮影の受付時間")).toBeVisible();
  await page.waitForFunction(
    () => ((document.querySelector("video") as HTMLVideoElement | null)?.videoWidth ?? 0) > 0,
  );
  await page.getByRole("button", { name: "撮影する" }).click();
  await expect(page.getByText(/位置を取得しました/)).toBeVisible();
  await page.getByRole("button", { name: "営業している" }).click();
  await page.getByRole("button", { name: "この内容で送信する" }).click();

  // W-07 -> W-08
  await expect(page.getByText("確認できました")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "報酬を見る" }).click();
  await expect(page.getByText("受け取り済み").first()).toBeVisible({ timeout: 30_000 });

  // Public result page
  await page.goto(`/r/${id}`);
  await expect(page.getByText("VERIFIED / OPEN")).toBeVisible();
  await expect(page.getByText("Solana Explorer で取引を見る")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Is this shop open right now? (e2e)");
});
