import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error("MASTER_KEY is required");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MASTER_KEY must be exactly 32 random bytes encoded as base64");
  return key;
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv64, tag64, data64] = payload.split(":");
  if (version !== "v1" || !iv64 || !tag64 || !data64) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv64, "base64"));
  decipher.setAuthTag(Buffer.from(tag64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data64, "base64")), decipher.final()]).toString("utf8");
}
