import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getKey(salt: Buffer): Buffer {
  // Use the Supabase service role key as encryption seed - already available, no extra env vars needed
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!secret) throw new Error("No encryption key available - check Supabase env vars");
  return scryptSync(secret, salt, 32);
}

export function encrypt(text: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = getKey(salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: salt:iv:tag:encrypted (all base64)
  return [salt, iv, tag, encrypted].map((b) => b.toString("base64")).join(":");
}

export function decrypt(data: string): string {
  const [saltB64, ivB64, tagB64, encB64] = data.split(":");
  if (!saltB64 || !ivB64 || !tagB64 || !encB64) throw new Error("Invalid encrypted data format");
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const key = getKey(salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
