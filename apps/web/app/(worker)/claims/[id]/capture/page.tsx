"use client";
import type { AnswerValue, TaskType } from "@proofmarket/core";
import { LIMITS } from "@proofmarket/core/domain/limits";
// W-06 撮影と回答 — challenge -> live camera -> capture 1–4 photos (canvas -> JPEG) -> high-accuracy location -> answer
// -> upload each photo -> submit (01 §4.18). Photos come only from the in-app camera; there is no gallery picker (07 §2).
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, remaining, Shell, useNow } from "@/components/ui";
import { ANSWER_JA, answerText, taskTypeText } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { AttestationBand } from "../../../attestation-band";
import type { ClaimDetail } from "../../../lib-claim";

interface Challenge {
  challenge_id: string;
  nonce: string;
  expires_at: string;
}
interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}
interface Photo {
  blob: Blob;
  url: string;
  takenAt: string;
}
const MAX_EDGE = 1920;
const MAX_PHOTOS = LIMITS.media.maxPhotos;

export default function CapturePage() {
  const lang = useLang();
  const types = taskTypeText(lang);
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(500);
  const video = useRef<HTMLVideoElement>(null);
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [answer, setAnswer] = useState("");
  // Form answers (01 §4.25): one value per field, sent as a single JSON object.
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schema = claim?.answer_schema;
  const formFields = schema?.type === "form" ? schema.fields : [];
  const formComplete = formFields.every((f) => f.required === false || (fields[f.key] ?? "").trim() !== "");
  const answerReady = schema?.type === "form" ? formComplete : answer.trim() !== "";
  const payload = () =>
    schema?.type === "form"
      ? JSON.stringify(
          Object.fromEntries(
            formFields.flatMap((f) => {
              const v = (fields[f.key] ?? "").trim();
              if (!v) return [];
              if (f.type === "number") return [[f.key, Number(v.replaceAll(",", ""))]];
              return [[f.key, f.type === "scale" ? Number(v) : v]];
            }),
          ),
        )
      : answer;
  const needsLocation = claim?.location_required ?? true;
  const answers = (schema?.type === "enum" ? schema.values : (claim?.answer_values ?? [])).map((v) =>
    v in ANSWER_JA
      ? { value: v, ...answerText(lang, v as AnswerValue) }
      : { value: v, label: v, tone: "bg-slate-700" },
  );

  const newChallenge = useCallback(async () => {
    setErr(null);
    try {
      setCh(await api<Challenge>(`/v1/worker/claims/${id}/challenge`, { method: "POST" }));
    } catch (e) {
      setErr(errorText(e, lang));
    }
  }, [api, id, lang]);

  useEffect(() => {
    api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setClaim, (e) => setErr(errorText(e, lang)));
    void newChallenge();
  }, [api, id, newChallenge, lang]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() =>
        setErr(
          pick(
            lang,
            "カメラの利用を許可してください。撮影はアプリ内のカメラでのみ行えます。",
            "Please allow camera access. Photos can only be taken with the in-app camera.",
          ),
        ),
      );
    return () => {
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, [lang]);

  function locate() {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => {
        if (needsLocation)
          setErr(
            pick(
              lang,
              "位置情報の利用を許可してください。指定の場所の近くにいることの確認に使います。",
              "Please allow location access. It is used to confirm you are near the requested place.",
            ),
          );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }

  function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const shot = { blob, url: URL.createObjectURL(blob), takenAt: new Date().toISOString() };
        setPhotos((ps) => (ps.length < MAX_PHOTOS ? [...ps, shot] : ps));
        locate();
      },
      "image/jpeg",
      0.85,
    );
  }

  function removePhoto(i: number) {
    setPhotos((ps) => {
      const gone = ps[i];
      if (gone) URL.revokeObjectURL(gone.url);
      return ps.filter((_, j) => j !== i);
    });
  }

  async function submit() {
    const [first] = photos;
    if (!ch || !first || (needsLocation && !fix) || !answerReady || !claim) return;
    setBusy(true);
    setErr(null);
    try {
      // Every photo is uploaded first; the submission names them all in the order they were taken.
      const refs: string[] = [];
      for (const p of photos) {
        const up = await api<{ upload_id: string; upload_url: string }>(`/v1/worker/claims/${id}/uploads`, {
          method: "POST",
          body: { challenge_id: ch.challenge_id, content_type: "image/jpeg", byte_size: p.blob.size },
        });
        const put = await fetch(up.upload_url, {
          method: "PUT",
          body: p.blob,
          headers: { "content-type": "image/jpeg" },
        });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        refs.push(up.upload_id);
      }
      await api(`/v1/worker/tasks/${claim.verification_id}/evidence`, {
        method: "POST",
        idem: `ev-${refs[0]}`,
        body: {
          claim_id: id,
          answer: payload(),
          capture: {
            client_timestamp: first.takenAt,
            ...(fix ? { lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy } : {}),
          },
          challenge: { nonce: ch.nonce },
          evidence: refs.map((object_ref) => ({ type: "photo", object_ref })),
        },
      });
      router.replace(langHref(lang, `/claims/${id}/result`));
    } catch (e) {
      setErr(errorText(e, lang));
      setBusy(false);
    }
  }

  const expired = ch ? new Date(ch.expires_at).getTime() <= now : false;
  const full = photos.length >= MAX_PHOTOS;
  return (
    <Shell title={pick(lang, "撮影と回答", "Shoot and answer")} back={`/claims/${id}`}>
      <AttestationBand lang={lang} attestation={claim?.attestation} className="rounded-2xl" />
      {claim ? (
        <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm">{claim.question}</p>
      ) : null}
      {claim?.acceptance_criteria ? (
        <p className="whitespace-pre-wrap rounded-2xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          <span className="font-bold">{pick(lang, "受け取りの条件: ", "Accepted when: ")}</span>
          {claim.acceptance_criteria}
        </p>
      ) : null}
      {ch ? (
        <Notice tone={expired ? "error" : "info"}>
          {pick(lang, "撮影の受付時間: ", "Capture window: ")}
          <b className="tabular-nums">{remaining(ch.expires_at, now, lang)}</b>
          {expired
            ? pick(lang, "（もう一度「撮影を始める」を押してください）", " (tap “Start capture” again)")
            : ""}
        </Notice>
      ) : null}
      {err ? <Notice tone="error">{err}</Notice> : null}

      {/* Stays mounted so the camera keeps running; hidden once the photo limit is reached. */}
      <div className={`overflow-hidden rounded-2xl bg-black ${full ? "hidden" : ""}`}>
        <video ref={video} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
      </div>
      <p className="text-xs text-slate-500">
        {types[claim?.type as TaskType]?.howTo ??
          pick(lang, "確かめた物が分かる写真を撮ってください。", "Take a photo that shows what you checked.")}
        {pick(
          lang,
          `人の顔が大きく写らないようにしてください。写真は${MAX_PHOTOS}枚まで送れます。`,
          ` Keep people's faces out of the frame. You can send up to ${MAX_PHOTOS} photos.`,
        )}
      </p>

      {photos.length ? (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <li key={p.url} className="relative">
              {/* biome-ignore lint/performance/noImgElement: local object URL preview */}
              <img
                src={p.url}
                alt={pick(lang, `撮影した写真 ${i + 1}枚目`, `Photo ${i + 1}`)}
                className="aspect-[3/4] w-full rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                disabled={busy}
                className="absolute top-1 right-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white"
                aria-label={pick(lang, `${i + 1}枚目を消す`, `Remove photo ${i + 1}`)}
              >
                {pick(lang, "消す", "Remove")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {full ? (
        <p className="text-sm text-slate-600">
          {pick(
            lang,
            `${MAX_PHOTOS}枚撮りました。撮り直すときは「消す」を押してください。`,
            `${MAX_PHOTOS} photos taken. Tap “Remove” to retake one.`,
          )}
        </p>
      ) : (
        <Button
          variant={photos.length ? "secondary" : undefined}
          onClick={shoot}
          disabled={!ch || expired || busy}
        >
          {photos.length
            ? pick(
                lang,
                `もう1枚撮る（${photos.length}/${MAX_PHOTOS}枚）`,
                `Take another (${photos.length}/${MAX_PHOTOS})`,
              )
            : pick(lang, "撮影する", "Take the photo")}
        </Button>
      )}

      {photos.length ? (
        <>
          {needsLocation ? (
            <p className="text-sm text-slate-600">
              {fix
                ? pick(
                    lang,
                    `位置を取得しました（誤差 約${fix.accuracy} m）`,
                    `Location acquired (accuracy about ${fix.accuracy} m)`,
                  )
                : pick(lang, "位置を取得しています…", "Getting your location…")}
              {fix && fix.accuracy > 100
                ? pick(
                    lang,
                    " — 精度が足りません。空の見える場所で少し待ってから撮り直してください。",
                    " — not accurate enough. Wait a moment somewhere with open sky and retake.",
                  )
                : ""}
            </p>
          ) : null}
          {schema?.type === "form" ? (
            <div className="grid gap-4">
              <p className="text-sm font-medium text-slate-700">
                {pick(
                  lang,
                  `${formFields.length} 項目に答えてください`,
                  `Fill in ${formFields.length} fields`,
                )}
              </p>
              {formFields.map((f) => (
                <div key={f.key} className="grid gap-1 text-sm font-medium text-slate-700">
                  <span>
                    {f.label}
                    {f.required === false ? (
                      <span className="ml-1 font-normal text-slate-400">
                        {pick(lang, "（任意）", " (optional)")}
                      </span>
                    ) : null}
                    {f.type === "number" && f.unit ? (
                      <span className="ml-1 font-normal text-slate-500">({f.unit})</span>
                    ) : null}
                  </span>
                  {f.type === "scale" ? (
                    // 13 §4: a row of circles; words only at the two ends.
                    <div className="grid gap-1">
                      <fieldset className="flex justify-between gap-1" aria-label={f.label}>
                        {Array.from({ length: f.max - (f.min ?? 1) + 1 }, (_, i) =>
                          String((f.min ?? 1) + i),
                        ).map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={fields[f.key] === n}
                            aria-label={n}
                            onClick={() => setFields((s) => ({ ...s, [f.key]: s[f.key] === n ? "" : n }))}
                            className={`aspect-square flex-1 rounded-full border-2 transition ${f.max > 5 ? "max-w-8" : "max-w-12"} ${fields[f.key] === n ? "border-teal-600 bg-teal-600 ring-4 ring-teal-200" : "border-slate-300 bg-white"}`}
                          />
                        ))}
                      </fieldset>
                      <div className="flex justify-between text-xs font-normal text-slate-500">
                        <span>{f.labels[0]}</span>
                        <span>{f.labels[1]}</span>
                      </div>
                    </div>
                  ) : f.type === "enum" ? (
                    <div className="grid grid-cols-2 gap-2">
                      {f.values.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFields((s) => ({ ...s, [f.key]: s[f.key] === v ? "" : v }))}
                          className={`rounded-xl px-3 py-3 text-base font-bold transition ${fields[f.key] === v ? "bg-teal-600 text-white ring-4 ring-teal-200" : "bg-slate-100 text-slate-800"}`}
                        >
                          {v in ANSWER_JA ? answerText(lang, v as AnswerValue).label : v}
                        </button>
                      ))}
                    </div>
                  ) : f.type === "number" ? (
                    <input
                      inputMode="decimal"
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-xl font-bold tabular-nums"
                      placeholder={pick(lang, "例: 1280", "e.g. 1280")}
                    />
                  ) : (
                    <textarea
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setFields((s) => ({ ...s, [f.key]: e.target.value }))}
                      maxLength={f.max_chars ?? 4000}
                      rows={3}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-base leading-relaxed"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : schema?.type === "number" ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              {pick(
                lang,
                `数字で答える${schema.unit ? `（単位: ${schema.unit}）` : ""}`,
                `Answer with a number${schema.unit ? ` (unit: ${schema.unit})` : ""}`,
              )}
              <input
                inputMode="decimal"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-4 text-2xl font-bold tabular-nums"
                placeholder={pick(lang, "例: 1280", "e.g. 1280")}
              />
            </label>
          ) : schema?.type === "text" ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              {pick(
                lang,
                `文章で答える${schema.max_chars ? `（${schema.max_chars}字まで）` : ""}`,
                `Answer in text${schema.max_chars ? ` (up to ${schema.max_chars} characters)` : ""}`,
              )}
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={schema.max_chars ?? 4000}
                rows={8}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-base leading-relaxed"
                placeholder={pick(
                  lang,
                  "見たこと・書かれていたこと・聞いたことを、そのまま書いてください",
                  "Write exactly what you saw, read or were told",
                )}
              />
              <span className="text-right text-xs text-slate-400">
                {pick(lang, `${answer.length} 字`, `${answer.length} chars`)}
              </span>
            </label>
          ) : (
            <div className="grid gap-3">
              {answers.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAnswer(a.value)}
                  className={`rounded-2xl px-4 py-4 text-lg font-bold text-white transition ${a.tone} ${answer === a.value ? "ring-4 ring-offset-2 ring-teal-400" : "opacity-80"}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <Button onClick={submit} disabled={!answerReady || (needsLocation && !fix) || busy || expired}>
            {busy ? pick(lang, "送信中…", "Sending…") : pick(lang, "この内容で送信する", "Submit")}
          </Button>
        </>
      ) : null}
      {expired ? (
        <Button variant="secondary" onClick={newChallenge}>
          {pick(lang, "撮影を始める（受付時間をやり直す）", "Start capture (new window)")}
        </Button>
      ) : null}
    </Shell>
  );
}
