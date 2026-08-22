import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import env from '../config';

const scryptAsync = promisify(scrypt);

// Derive encryption key from env ENCRYPTION_KEY (base64 encoded 32 bytes)
const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, 'base64');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

export async function encrypt(text: string): Promise<string> {
  const iv = randomBytes(IV_LENGTH);
  const salt = randomBytes(SALT_LENGTH);
  
  const key = await scryptAsync(ENCRYPTION_KEY, salt, 32) as Buffer;
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted1 = cipher.update(text, 'utf8');
  const encrypted2 = cipher.final();
  const encrypted = Buffer.concat([encrypted1, encrypted2]);
  const tag = cipher.getAuthTag();
  
  // Format: salt:iv:tag:encrypted (all base64)
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export async function decrypt(encryptedData: string): Promise<string> {
  const [saltB64, ivB64, tagB64, encryptedB64] = encryptedData.split(':');
  
  if (!saltB64 || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted data format');
  }
  
  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  
  const key = await scryptAsync(ENCRYPTION_KEY, salt, 32) as Buffer;
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted1 = decipher.update(encrypted);
  const decrypted2 = decipher.final();
  
  return Buffer.concat([decrypted1, decrypted2]).toString('utf8');
}

export function getKeyHash(key: string): string {
  // Return last 4 characters for display
  return key.slice(-4);
}

export function generateEncryptionKey(): string {
  // Generate a new 32-byte key and return as base64
  return randomBytes(32).toString('base64');
}