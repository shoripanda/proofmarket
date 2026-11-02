import "server-only";
import { LIMITS } from "@proofmarket/core";
import { createClient } from "@supabase/supabase-js";
import { type EvidenceStorage, isAudioKey } from "../ports";

const RAW = "evidence-raw";
const DERIVED = "evidence-derived";
const AUDIO = "evidence-audio";
/** Where the uploaded file lives: audio clips have their own bucket (docs/architecture 16 §9). */
const original = (key: string) => (isAudioKey(key) ? AUDIO : RAW);

/**
 * Buckets must be private. evidence-raw and evidence-derived: file_size_limit = 8 MiB, allowed_mime_types =
 * image/jpeg (01 §4.7). evidence-audio: 2 MiB, audio/mp4 and audio/webm. scripts/supabase-setup.ts creates all three.
 */
export function createSupabaseStorage(cfg: { url: string; serviceRoleKey: string }): EvidenceStorage {
  const sb = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } });
  return {
    async createSignedUploadUrl(key) {
      const { data, error } = await sb.storage.from(original(key)).createSignedUploadUrl(key);
      if (error || !data) throw new Error(`signed upload url: ${error?.message}`);
      return { url: data.signedUrl, expiresInS: LIMITS.uploadUrlTtlS };
    },
    async read(key) {
      const { data, error } = await sb.storage.from(original(key)).download(key);
      if (error || !data) return null;
      const info = await sb.storage.from(original(key)).info(key);
      const created = info.data?.createdAt ? new Date(info.data.createdAt) : new Date(0);
      return { bytes: Buffer.from(await data.arrayBuffer()), createdAt: created };
    },
    async putDerived(key, bytes) {
      const { error } = await sb.storage
        .from(DERIVED)
        .upload(key, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(`derived upload: ${error.message}`);
    },
    async createSignedDownloadUrl(bucket, key, ttlS) {
      // A photo's original keeps its EXIF, so only an audio clip is ever served from the original.
      if (bucket === RAW && !isAudioKey(key)) throw new Error("raw photos are never served");
      const from = bucket === RAW ? AUDIO : DERIVED;
      const { data, error } = await sb.storage.from(from).createSignedUrl(key, ttlS);
      if (error || !data) throw new Error(`signed download url: ${error?.message}`);
      return data.signedUrl;
    },
    async remove(bucket, keys) {
      const groups =
        bucket === RAW
          ? [
              { from: RAW, keys: keys.filter((k) => !isAudioKey(k)) },
              { from: AUDIO, keys: keys.filter(isAudioKey) },
            ]
          : [{ from: bucket, keys }];
      for (const g of groups) {
        if (g.keys.length === 0) continue;
        const { error } = await sb.storage.from(g.from).remove(g.keys);
        if (error) throw new Error(`remove: ${error.message}`);
      }
    },
  };
}
