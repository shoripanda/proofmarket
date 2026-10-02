import "server-only";
import { LIMITS } from "@proofmarket/core";
import { createClient } from "@supabase/supabase-js";
import type { EvidenceStorage } from "../ports";

const RAW = "evidence-raw";
const DERIVED = "evidence-derived";

/** Buckets must be private with file_size_limit = 8 MiB and allowed_mime_types = image/jpeg (01 §4.7). */
export function createSupabaseStorage(cfg: { url: string; serviceRoleKey: string }): EvidenceStorage {
  const sb = createClient(cfg.url, cfg.serviceRoleKey, { auth: { persistSession: false } });
  return {
    async createSignedUploadUrl(key) {
      const { data, error } = await sb.storage.from(RAW).createSignedUploadUrl(key);
      if (error || !data) throw new Error(`signed upload url: ${error?.message}`);
      return { url: data.signedUrl, expiresInS: LIMITS.uploadUrlTtlS };
    },
    async read(key) {
      const { data, error } = await sb.storage.from(RAW).download(key);
      if (error || !data) return null;
      const info = await sb.storage.from(RAW).info(key);
      const created = info.data?.createdAt ? new Date(info.data.createdAt) : new Date(0);
      return { bytes: Buffer.from(await data.arrayBuffer()), createdAt: created };
    },
    async putDerived(key, bytes) {
      const { error } = await sb.storage
        .from(DERIVED)
        .upload(key, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(`derived upload: ${error.message}`);
    },
    async createSignedDownloadUrl(_bucket, key, ttlS) {
      const { data, error } = await sb.storage.from(DERIVED).createSignedUrl(key, ttlS);
      if (error || !data) throw new Error(`signed download url: ${error?.message}`);
      return data.signedUrl;
    },
    async remove(bucket, keys) {
      if (keys.length === 0) return;
      const { error } = await sb.storage.from(bucket).remove(keys);
      if (error) throw new Error(`remove: ${error.message}`);
    },
  };
}
