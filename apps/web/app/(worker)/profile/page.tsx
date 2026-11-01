"use client";
// W-24 My public profile (docs/architecture 14 §3): off by default. The worker sees exactly what will be shown,
// turns it on or off, and decides separately whether search engines may index it.
import { PROFILE_LANGUAGES } from "@proofmarket/core";
import { useEffect, useState } from "react";
import { Button, Card, Notice, Shell } from "@/components/ui";
import { ApiErr, errorText, useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import { completedText, languageName, ratingText } from "@/lib/profile-text";

type Mine = {
  profile: {
    public: boolean;
    indexable: boolean;
    public_id: string;
    display_name: string;
    city: string | null;
    skills: string[];
    languages: string[];
  } | null;
  completed: number;
  rating: { average: number; count: number } | null;
};

const field = "mt-1 w-full rounded-xl border border-slate-300 p-3 text-base";

export default function ProfilePage() {
  const lang = useLang();
  const api = useApi();
  const [mine, setMine] = useState<Mine | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [skills, setSkills] = useState("");
  const [langs, setLangs] = useState<string[]>([]);
  const [indexable, setIndexable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    api<Mine>("/v1/worker/profile").then(
      (r) => {
        setMine(r);
        if (r.profile) {
          setName(r.profile.display_name);
          setCity(r.profile.city ?? "");
          setSkills(r.profile.skills.join(", "));
          setLangs(r.profile.languages);
          setIndexable(r.profile.indexable);
        }
      },
      (e) => setMsg({ tone: "error", text: errorText(e, lang) }),
    );
  }, [api, lang]);

  const skillList = skills
    .split(/[,、，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function save(publish: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Mine>("/v1/worker/profile", {
        method: "PUT",
        body: {
          public: publish,
          indexable: publish && indexable,
          display_name: name,
          city: city.trim() || null,
          skills: skillList,
          languages: langs,
        },
      });
      setMine(r);
      setMsg({
        tone: "info",
        text: publish
          ? pick(lang, "公開しました。", "Your profile is public.")
          : pick(lang, "非公開にしました。一覧とページからすぐに消えます。", "Your profile is hidden now."),
      });
    } catch (e) {
      const reason = e instanceof ApiErr ? (e.details as { reason?: string }).reason : undefined;
      setMsg({
        tone: "error",
        text:
          reason === "contact_details"
            ? pick(
                lang,
                "メールアドレス・電話番号・ほかのアプリの ID・外での支払いの案内は書けません。",
                "Email addresses, phone numbers, other apps' IDs and payment outside ProofMarket cannot be listed.",
              )
            : e instanceof ApiErr && e.code === "VALIDATION_FAILED"
              ? pick(
                  lang,
                  "入力を見直してください。名前は 2〜40 字、地域は市区町村まで（数字は使えません）、できることは 10 個まで、言語は 5 つまでです。",
                  "Please check: name 2-40 characters, area a city or ward only (no digits), up to 10 skills and 5 languages.",
                )
              : errorText(e, lang),
      });
    } finally {
      setBusy(false);
    }
  }

  const isPublic = mine?.profile?.public ?? false;
  const toggleLang = (code: string) =>
    setLangs((l) => (l.includes(code) ? l.filter((x) => x !== code) : l.length < 5 ? [...l, code] : l));

  return (
    <Shell title={pick(lang, "公開プロフィール", "Public profile")} back="/jobs">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Card>
        <p className="text-sm leading-relaxed text-slate-600">
          {pick(
            lang,
            "公開すると、依頼者や AI エージェントがあなたを見つけて、仕事を頼みやすくなります。公開しなくても仕事は受けられます。いつでも非公開に戻せます。",
            "A public profile helps requesters and AI agents find you. You can take work without one, and you can hide it at any time.",
          )}
        </p>
        <p className="mt-2 text-sm font-bold">
          {isPublic
            ? pick(lang, "いまは公開中です", "Public now")
            : pick(lang, "いまは非公開です", "Hidden now")}
          {isPublic && mine?.profile ? (
            <>
              {" · "}
              <LLink href={`/people/${mine.profile.public_id}`} className="text-teal-700 underline">
                {pick(lang, "公開ページを見る", "View the page")}
              </LLink>
            </>
          ) : null}
        </p>
      </Card>
      <Card>
        <label className="mb-3 block text-sm">
          <span className="font-medium">
            {pick(lang, "表示名（本名でなくてよい）", "Display name (need not be your real name)")}
          </span>
          <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mb-3 block text-sm">
          <span className="font-medium">
            {pick(lang, "地域（市区町村まで・任意）", "Area (city or ward, optional)")}
          </span>
          <input
            className={field}
            value={city}
            maxLength={40}
            placeholder={pick(lang, "例：渋谷区", "e.g. Shibuya-ku")}
            onChange={(e) => setCity(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {pick(lang, "番地・駅・建物名は書かないでください。", "No street, station or building.")}
          </span>
        </label>
        <label className="mb-3 block text-sm">
          <span className="font-medium">
            {pick(
              lang,
              "できること（読点かカンマで区切る・10 個まで）",
              "Skills (comma separated, up to 10)",
            )}
          </span>
          <input
            className={field}
            value={skills}
            placeholder={pick(
              lang,
              "例：写真、翻訳、電話の確認",
              "e.g. Photography, Translation, Phone calls",
            )}
            onChange={(e) => setSkills(e.target.value)}
          />
        </label>
        <fieldset className="mb-3 text-sm">
          <legend className="font-medium">
            {pick(lang, "使える言語（5 つまで）", "Languages (up to 5)")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROFILE_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleLang(code)}
                aria-pressed={langs.includes(code)}
                className={`tap rounded-full border px-3 py-1 ${
                  langs.includes(code)
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {languageName(code, lang)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="mb-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={indexable}
            onChange={(e) => setIndexable(e.target.checked)}
          />
          <span>
            {pick(
              lang,
              "検索エンジン（Google など）に載せてもよい。外しておくと、ProofMarket の中でだけ見つかります。",
              "Search engines (Google and others) may list my page. Leave it off to be found only on ProofMarket.",
            )}
          </span>
        </label>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          {pick(
            lang,
            `公開されるのは、表示名・地域・できること・言語と、ProofMarket が数える完了件数（${completedText(mine?.completed ?? 0, lang)}）と評価（${ratingText(mine?.rating ?? null, lang)}）だけです。写真・位置・財布のアドレスは出ません。`,
            `Only the name, area, skills and languages are shown, with the completed count (${completedText(mine?.completed ?? 0, lang)}) and rating (${ratingText(mine?.rating ?? null, lang)}) that ProofMarket keeps. No photo, location or wallet address.`,
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(true)} disabled={busy || name.trim().length < 2}>
            {isPublic ? pick(lang, "保存する", "Save") : pick(lang, "公開する", "Publish")}
          </Button>
          {isPublic ? (
            <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
              {pick(lang, "非公開にする", "Hide")}
            </Button>
          ) : null}
        </div>
      </Card>
    </Shell>
  );
}
