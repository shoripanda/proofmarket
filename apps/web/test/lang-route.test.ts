// One language everywhere (13 §7): the proxy's decision, as a pure function.
import { describe, expect, it } from "vitest";
import { isCrawler, resolveLangRoute } from "@/lib/lang";

describe("resolveLangRoute", () => {
  it("renders Japanese paths as Japanese when nothing was chosen", () => {
    expect(resolveLangRoute("/tasks", "", undefined)).toEqual({ lang: "ja" });
    expect(resolveLangRoute("/", "", "ja")).toEqual({ lang: "ja" });
  });

  it("renders /en paths in English and remembers the choice once", () => {
    expect(resolveLangRoute("/en/tasks", "", undefined)).toEqual({ lang: "en", setCookie: "en" });
    expect(resolveLangRoute("/en", "", "en")).toEqual({ lang: "en" });
  });

  it("sends a reader who chose English to the English page when a link lands on a Japanese URL", () => {
    expect(resolveLangRoute("/tasks/ver_1", "?x=1", "en")).toEqual({
      lang: "en",
      redirectTo: "/en/tasks/ver_1?x=1",
    });
    expect(resolveLangRoute("/", "", "en")).toEqual({ lang: "en", redirectTo: "/en" });
  });

  it("?lang= is an explicit choice: remember it and drop the parameter", () => {
    expect(resolveLangRoute("/en/pricing", "?lang=ja", "en")).toEqual({
      lang: "ja",
      redirectTo: "/pricing",
      setCookie: "ja",
    });
    expect(resolveLangRoute("/pricing", "?lang=en&plain=1", undefined)).toEqual({
      lang: "en",
      redirectTo: "/en/pricing?plain=1",
      setCookie: "en",
    });
    expect(resolveLangRoute("/pricing", "?lang=fr", "en")).toEqual({
      lang: "en",
      redirectTo: "/en/pricing?lang=fr",
    });
  });

  it("shows English to a reader outside Japan who never chose, without remembering it", () => {
    expect(resolveLangRoute("/tasks", "?a=1", undefined, "US")).toEqual({
      lang: "en",
      redirectTo: "/en/tasks?a=1",
    });
    expect(resolveLangRoute("/tasks", "", undefined, "de")).toEqual({ lang: "en", redirectTo: "/en/tasks" });
    expect(resolveLangRoute("/tasks", "", undefined, "JP")).toEqual({ lang: "ja" });
    expect(resolveLangRoute("/tasks", "", undefined, null)).toEqual({ lang: "ja" });
  });

  it("keeps Japanese for a reader abroad who chose it", () => {
    expect(resolveLangRoute("/tasks", "", "ja", "FR")).toEqual({ lang: "ja" });
    expect(resolveLangRoute("/tasks", "?lang=ja", undefined, "FR")).toEqual({
      lang: "ja",
      redirectTo: "/tasks",
      setCookie: "ja",
    });
  });
});

describe("isCrawler", () => {
  it("tells search engines from people", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});
