"use client";
import type { AnswerValue, TaskType } from "@proofmarket/core";
// W-06 撮影と回答 — challenge -> live camera -> capture (canvas -> JPEG) -> high-accuracy location -> answer -> upload -> submit.
// Photos come only from the in-app camera; there is no gallery picker (07 §2).
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, remaining, Shell, useNow } from "@/components/ui";
import { ANSWER_JA, TASK_TYPE_JA } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";
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
const MAX_EDGE = 1920;

export default function CapturePage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(500);
  const video = useRef<HTMLVideoElement>(null);
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; takenAt: string } | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const answers = (claim?.answer_values ?? []).map((v) => ({
    value: v,
    label: ANSWER_JA[v as AnswerValue]?.label ?? v,
    tone: ANSWER_JA[v as AnswerValue]?.tone ?? "bg-slate-700",
  }));

  const newChallenge = useCallback(async () => {
    setErr(null);
    try {
      setCh(await api<Challenge>(`/v1/worker/claims/${id}/challenge`, { method: "POST" }));
    } catch (e) {
      setErr(errorText(e));
    }
  }, [api, id]);

  useEffect(() => {
    api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setClaim, (e) => setErr(errorText(e)));
    void newChallenge();
  }, [api, id, newChallenge]);

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
      .catch(() => setErr("カメラの利用を許可してください。撮影はアプリ内のカメラでのみ行えます。"));
    return () => {
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, []);

  function locate() {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => setErr("位置情報の利用を許可してください。お店の近くにいることの確認に使います。"),
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
        setPhoto({ blob, url: URL.createObjectURL(blob), takenAt: new Date().toISOString() });
        locate();
      },
      "image/jpeg",
      0.85,
    );
  }

  async function submit() {
    if (!ch || !photo || !fix || !answer || !claim) return;
    setBusy(true);
    setErr(null);
    try {
      const up = await api<{ upload_id: string; upload_url: string }>(`/v1/worker/claims/${id}/uploads`, {
        method: "POST",
        body: { challenge_id: ch.challenge_id, content_type: "image/jpeg", byte_size: photo.blob.size },
      });
      const put = await fetch(up.upload_url, {
        method: "PUT",
        body: photo.blob,
        headers: { "content-type": "image/jpeg" },
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      await api(`/v1/worker/tasks/${claim.verification_id}/evidence`, {
        method: "POST",
        idem: `ev-${up.upload_id}`,
        body: {
          claim_id: id,
          answer,
          capture: { client_timestamp: photo.takenAt, lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy },
          challenge: { nonce: ch.nonce },
          evidence: [{ type: "photo", object_ref: up.upload_id }],
        },
      });
      router.replace(`/claims/${id}/result`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  const expired = ch ? new Date(ch.expires_at).getTime() <= now : false;
  return (
    <Shell title="撮影と回答" back={`/claims/${id}`}>
      {ch ? (
        <Notice tone={expired ? "error" : "info"}>
          撮影の受付時間: <b className="tabular-nums">{remaining(ch.expires_at, now)}</b>
          {expired ? "（もう一度「撮影を始める」を押してください）" : ""}
        </Notice>
      ) : null}
      {err ? <Notice tone="error">{err}</Notice> : null}

      <div className="overflow-hidden rounded-2xl bg-black">
        {photo ? (
          // biome-ignore lint/performance/noImgElement: local object URL preview
          <img src={photo.url} alt="撮影した写真" className="aspect-[3/4] w-full object-cover" />
        ) : (
          <video ref={video} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
        )}
      </div>
      <p className="text-xs text-slate-500">
        {TASK_TYPE_JA[claim?.type as TaskType]?.howTo ?? "店頭・看板・営業時間の掲示を写してください。"}
        人の顔が大きく写らないようにしてください。
      </p>

      {photo ? (
        <Button variant="secondary" onClick={() => setPhoto(null)}>
          撮り直す
        </Button>
      ) : (
        <Button onClick={shoot} disabled={!ch || expired}>
          撮影する
        </Button>
      )}

      {photo ? (
        <>
          <p className="text-sm text-slate-600">
            {fix ? `位置を取得しました（誤差 約${fix.accuracy} m）` : "位置を取得しています…"}
            {fix && fix.accuracy > 100
              ? " — 精度が足りません。空の見える場所で少し待ってから撮り直してください。"
              : ""}
          </p>
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
          <Button onClick={submit} disabled={!answer || !fix || busy || expired}>
            {busy ? "送信中…" : "この内容で送信する"}
          </Button>
        </>
      ) : null}
      {expired ? (
        <Button variant="secondary" onClick={newChallenge}>
          撮影を始める（受付時間をやり直す）
        </Button>
      ) : null}
    </Shell>
  );
}
