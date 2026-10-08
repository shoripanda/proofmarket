// One language everywhere (13 §7): the proxy's decision, as a pure function.
import { describe, expect, it } from "vitest";
import { resolveLangRoute } from "@/lib/lang";

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
});
