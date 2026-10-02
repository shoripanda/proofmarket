import type { EvidenceStorage, IdentityProvider } from "../../lib/ports";

/** Tokens look like `tok:<userId>`; addresses come from the map. */
export class FakeIdentity implements IdentityProvider {
  addresses = new Map<string, string>();
  async verifyAccessToken(token: string) {
    if (!token.startsWith("tok:")) throw new Error("invalid token");
    return { userId: token.slice(4) };
  }
  async payoutAddress(userId: string) {
    return this.addresses.get(userId) ?? null;
  }
}

export class FakeStorage implements EvidenceStorage {
  raw = new Map<string, { bytes: Buffer; createdAt: Date }>();
  derived = new Map<string, Buffer>();
  constructor(private readonly now: () => Date) {}
  async createSignedUploadUrl(key: string) {
    return { url: `https://storage.test/upload/${key}`, expiresInS: 120 };
  }
  /** Simulates the client PUT to the signed URL. */
  upload(key: string, bytes: Buffer, createdAt = this.now()) {
    this.raw.set(key, { bytes, createdAt });
  }
  async read(key: string) {
    return this.raw.get(key) ?? null;
  }
  async putDerived(key: string, bytes: Buffer) {
    this.derived.set(key, bytes);
  }
  async createSignedDownloadUrl(_b: "evidence-derived", key: string, ttl: number) {
    return `https://storage.test/download/${key}?ttl=${ttl}`;
  }
  async remove(bucket: "evidence-raw" | "evidence-derived", keys: string[]) {
    for (const k of keys) (bucket === "evidence-raw" ? this.raw : this.derived).delete(k);
  }
}
