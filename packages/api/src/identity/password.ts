import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 2 ** 14;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 5;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const FORMAT = 'scrypt';

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: MAX_MEMORY,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return [FORMAT, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, encodedHash: string | null | undefined): Promise<boolean> {
  const [format, cost, blockSize, parallelization, encodedSalt, encodedKey, ...extra] = (encodedHash ?? '').split('$');
  if (
    format !== FORMAT
    || Number(cost) !== COST
    || Number(blockSize) !== BLOCK_SIZE
    || Number(parallelization) !== PARALLELIZATION
    || !encodedSalt
    || !encodedKey
    || extra.length > 0
  ) {
    await deriveKey(password, Buffer.alloc(16));
    return false;
  }

  let salt: Buffer;
  let expectedKey: Buffer;
  try {
    salt = Buffer.from(encodedSalt, 'base64url');
    expectedKey = Buffer.from(encodedKey, 'base64url');
  } catch {
    await deriveKey(password, Buffer.alloc(16));
    return false;
  }

  if (salt.length !== 16 || expectedKey.length !== KEY_LENGTH) {
    await deriveKey(password, Buffer.alloc(16));
    return false;
  }

  const actualKey = await deriveKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}
