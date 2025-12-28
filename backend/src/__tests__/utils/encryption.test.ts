import { encrypt, decrypt } from '../../utils/encryption';

// 테스트용 마스터 키 설정
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Encryption Utils', () => {
  describe('encrypt', () => {
    it('should encrypt text', () => {
      const text = 'sensitive-api-key-12345';
      const encrypted = encrypt(text);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(text);
      expect(encrypted).toContain(':');
    });

    it('should produce different encrypted values for the same text', () => {
      const text = 'sensitive-api-key-12345';
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);

      // Salt가 다르므로 암호화 결과도 다름
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted text', () => {
      const original = 'sensitive-api-key-12345';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should throw error for invalid encrypted text', () => {
      const invalidEncrypted = 'invalid:encrypted:text';

      expect(() => {
        decrypt(invalidEncrypted);
      }).toThrow();
    });
  });

  describe('encrypt and decrypt roundtrip', () => {
    it('should successfully encrypt and decrypt various texts', () => {
      const testCases = [
        'simple-key',
        'complex-key-with-special-chars-!@#$%',
        'very-long-key-that-might-cause-issues-if-not-handled-properly',
        '1234567890',
      ];

      testCases.forEach((text) => {
        const encrypted = encrypt(text);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(text);
      });
    });
  });
});

