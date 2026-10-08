// 13 §7: the pure parts of the beginner path — plain words, the 30-second tour's timing, the yen hint.
import { describe, expect, it } from "vitest";
import { sceneAt } from "../components/explainer";
import { FLOW_STAGES } from "../components/flow-diagram";
import { splitTerms, TERMS } from "../lib/client/plain";
import { rateNote, YEN_PER_USDC, yenHint } from "../lib/client/rate";
import en from "../public/audio/explainer-en.json";
import ja from "../public/audio/explainer-ja.json";

const plainText = (text: string, lang: "ja" | "en") =>
  splitTerms(text, lang)
    .map((p) => (typeof p === "string" ? p : p.plain))
    .join("");
const wordText = (text: string, lang: "ja" | "en") =>
  splitTerms(text, lang)
    .map((p) => (typeof p === "string" ? p : p.word))
    .join("");

describe("splitTerms (plain words)", () => {
  it("swaps every word of the 13 §0 table in Japanese", () => {
    const s = "報酬はエスクローへ預け、結果は Solana に記録します。MCP か x402 で頼めます。";
    expect(plainText(s, "ja")).toBe(
      "報酬は預かりへ預け、結果は改ざんできない台帳に記録します。AI の接続口かその場払いで頼めます。",
    );
  });
  it("handles amounts, Devnet and the test currency as whole phrases", () => {
    expect(plainText("報酬は1件 5 USDC まで", "ja")).toBe("報酬は1件 5 ドル相当まで");
    expect(plainText("Solana Devnet のテスト用 USDC で払います", "ja")).toBe(
      "試験用の台帳のテスト用のデジタルマネーで払います",
    );
    expect(plainText("Solana のエスクローに", "ja")).toBe("改ざんできない預かりに");
    expect(plainText("up to 5 USDC per request", "en")).toBe("up to $5 in digital dollars per request");
    expect(plainText("An escrow account per request", "en")).toBe("A holding account per request");
  });
  it("covers API keys and wallets", () => {
    expect(plainText("API キーも、ウォレットの知識も要りません", "ja")).toBe(
      "利用の鍵も、デジタルのお財布の知識も要りません",
    );
    expect(plainText("any agent with a Solana wallet, no API key", "en")).toBe(
      "any agent with a digital wallet, no access key",
    );
  });
  it("gives back the original sentence when plain words are off", () => {
    for (const [s, lang] of [
      ["結果と支払いは Solana に残り、報酬は 0.30 USDC です。", "ja"],
      ["The bounty goes into escrow on Solana; pay with x402 over MCP.", "en"],
    ] as const) {
      expect(wordText(s, lang)).toBe(s);
      for (const t of Object.values(TERMS)) expect(plainText(s, lang)).not.toContain(t[lang].word);
    }
  });
  it("leaves text without jargon as one piece", () => {
    expect(splitTerms("近くの依頼を見る", "ja")).toEqual(["近くの依頼を見る"]);
  });
});

describe("30-second tour", () => {
  it("has one caption per stage, in order, within 30 seconds", () => {
    for (const s of [ja, en]) {
      expect(s.lines).toHaveLength(FLOW_STAGES.length);
      const starts = s.lines.map((l) => l.start);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      expect(s.duration).toBeLessThanOrEqual(30);
    }
  });
  it("picks the last scene that has started", () => {
    const lines = [0, 4, 8].map((start) => ({ start, text: "" }));
    expect(sceneAt(lines, 0)).toBe(0);
    expect(sceneAt(lines, 3.9)).toBe(0);
    expect(sceneAt(lines, 4)).toBe(1);
    expect(sceneAt(lines, 99)).toBe(2);
  });
});

describe("yenHint", () => {
  it("shows a rounded yen estimate at the fixed rate", () => {
    expect(YEN_PER_USDC).toBe(150);
    expect(yenHint("0.30")).toBe("約 45 円");
    expect(yenHint("12", "en")).toBe("about ¥1,800");
    expect(yenHint("0.001")).toBe("1 円未満");
    expect(rateNote("ja")).toContain("目安");
  });
});
