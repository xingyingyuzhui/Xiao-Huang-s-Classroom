import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const DEK_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export type EncryptedCredential = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  wrappedDek: Buffer;
  kekVersion: number;
};

export function encryptApiKey(apiKey: string, kek: Buffer, kekVersion: number): EncryptedCredential {
  const dek = randomBytes(DEK_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, dek, nonce);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const dekNonce = randomBytes(NONCE_BYTES);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekNonce);
  const wrappedDek = Buffer.concat([
    dekNonce,
    dekCipher.update(dek),
    dekCipher.final(),
    dekCipher.getAuthTag(),
  ]);

  return { ciphertext, nonce, tag, wrappedDek, kekVersion };
}

export function decryptApiKey(encrypted: EncryptedCredential, kek: Buffer): string {
  const dekNonce = encrypted.wrappedDek.subarray(0, NONCE_BYTES);
  const dekCiphertext = encrypted.wrappedDek.subarray(NONCE_BYTES, encrypted.wrappedDek.length - TAG_BYTES);
  const dekTag = encrypted.wrappedDek.subarray(encrypted.wrappedDek.length - TAG_BYTES);
  const dekDecipher = createDecipheriv(ALGORITHM, kek, dekNonce);
  dekDecipher.setAuthTag(dekTag);
  const dek = Buffer.concat([dekDecipher.update(dekCiphertext), dekDecipher.final()]);

  const decipher = createDecipheriv(ALGORITHM, dek, encrypted.nonce);
  decipher.setAuthTag(encrypted.tag);
  return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString('utf8');
}
