import crypto from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger({
  screenName: 'Encryption',
  callerFunction: 'EncryptionService',
});

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// 마스터 키는 환경 변수에서 가져오거나 KMS 사용
function getMasterKey(): Buffer {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    logger.error('ENCRYPTION_MASTER_KEY not configured', {
      logType: 'error',
    });
    throw new Error('Encryption master key not configured');
  }

  // 키가 32바이트가 아니면 해시하여 생성
  if (masterKey.length !== KEY_LENGTH * 2) {
    return crypto.createHash('sha256').update(masterKey).digest();
  }

  return Buffer.from(masterKey, 'hex');
}

export function encrypt(text: string): string {
  try {
    const masterKey = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Salt를 사용하여 키 유도
    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512');

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();

    // salt:iv:tag:encrypted 형식으로 저장
    const result = `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;

    logger.debug('Text encrypted', {
      logType: 'success',
    });

    return result;
  } catch (error) {
    logger.error('Encryption failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: 'error',
    });
    throw error;
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const masterKey = getMasterKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted text format');
    }

    const [saltHex, ivHex, tagHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    // Salt를 사용하여 키 유도
    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug('Text decrypted', {
      logType: 'success',
    });

    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: 'error',
    });
    throw error;
  }
}

