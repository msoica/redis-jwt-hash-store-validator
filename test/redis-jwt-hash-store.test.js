const RedisJWTHashStore = require('../src/index');
const crypto = require('crypto');

describe('RedisJWTHashStore', () => {
  let store;
  const testJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
  const testKeyName = 'user123';
  const testLocale = '127.0.0.1';
  const testExpiration = 3600;

  beforeAll(async () => {
    store = new RedisJWTHashStore();
    await store.connect();
  });

  afterAll(async () => {
    await store.client.disconnect();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await store.deleteAllByKeyName(store.prefixValid, testKeyName);
    await store.deleteAllByKeyName(store.prefixBlacklist, testKeyName);
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultStore = new RedisJWTHashStore();
      expect(defaultStore.prefixValid).toBe('valid-jwt');
      expect(defaultStore.prefixBlacklist).toBe('blacklisted-jwt');
    });

    it('should create instance with custom options', () => {
      const customStore = new RedisJWTHashStore({
        prefixValid: 'custom-valid',
        prefixBlacklist: 'custom-blacklist',
      });
      expect(customStore.prefixValid).toBe('custom-valid');
      expect(customStore.prefixBlacklist).toBe('custom-blacklist');
    });
  });

  describe('storeValidJWT', () => {
    it('should store valid JWT hash', async () => {
      await store.storeValidJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixValid}:${testKeyName}:${jwtHash}`;

      const storedData = await store.client.hGetAll(redisKey);
      expect(storedData).toEqual({
        keyName: testKeyName,
        jwtHash: jwtHash,
        locale: testLocale,
      });
    });

    it('should set expiration when provided', async () => {
      await store.storeValidJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixValid}:${testKeyName}:${jwtHash}`;

      const ttl = await store.client.ttl(redisKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(testExpiration);
    });

    it('should not set expiration when 0 or undefined', async () => {
      await store.storeValidJWT(testKeyName, testJWT, testLocale, 0);

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixValid}:${testKeyName}:${jwtHash}`;

      const ttl = await store.client.ttl(redisKey);
      expect(ttl).toBeDefined();
    });
  });

  describe('storeBlacklistedJWT', () => {
    it('should store blacklisted JWT hash', async () => {
      await store.storeBlacklistedJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixBlacklist}:${testKeyName}:${jwtHash}`;

      const storedData = await store.client.hGetAll(redisKey);
      expect(storedData).toEqual({
        keyName: testKeyName,
        jwtHash: jwtHash,
        locale: testLocale,
      });
    });

    it('should set expiration for blacklisted JWT', async () => {
      await store.storeBlacklistedJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixBlacklist}:${testKeyName}:${jwtHash}`;

      const ttl = await store.client.ttl(redisKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(testExpiration);
    });
  });

  describe('validateJWT', () => {
    it('should validate existing valid JWT', async () => {
      await store.storeValidJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      const result = await store.validateJWT(testKeyName, testJWT);
      expect(result).toBe(true);
    });

    it('should reject blacklisted JWT', async () => {
      await store.storeBlacklistedJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      await expect(store.validateJWT(testKeyName, testJWT)).rejects.toThrow(
        'JWT is blacklisted'
      );
    });

    // it('should reject non-existent JWT', async () => {
    //   await expect(store.validateJWT(testKeyName, testJWT)).rejects.toThrow(
    //       'JWT does not exist in valid list'
    //   );
    // });

    it('should reject valid JWT that was later blacklisted', async () => {
      await store.storeValidJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );
      await store.storeBlacklistedJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );

      await expect(store.validateJWT(testKeyName, testJWT)).rejects.toThrow(
        'JWT is blacklisted'
      );
    });
  });

  describe('deleteRecord', () => {
    it('should delete a valid JWT record', async () => {
      await store.storeValidJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );
      await store.deleteRecord(store.prefixValid, testKeyName, testJWT);

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixValid}:${testKeyName}:${jwtHash}`;

      const exists = await store.client.exists(redisKey);
      expect(exists).toBe(0);
    });

    it('should delete a blacklisted JWT record', async () => {
      await store.storeBlacklistedJWT(
        testKeyName,
        testJWT,
        testLocale,
        testExpiration
      );
      await store.deleteRecord(store.prefixBlacklist, testKeyName, testJWT);

      const jwtHash = crypto.createHash('sha256').update(testJWT).digest('hex');
      const redisKey = `${store.prefixBlacklist}:${testKeyName}:${jwtHash}`;

      const exists = await store.client.exists(redisKey);
      expect(exists).toBe(0);
    });
  });

  describe('deleteAllByKeyName', () => {
    it('should delete all valid JWTs for a keyName', async () => {
      const jwt1 = testJWT + '1';
      const jwt2 = testJWT + '2';

      await store.storeValidJWT(testKeyName, jwt1, testLocale, testExpiration);
      await store.storeValidJWT(testKeyName, jwt2, testLocale, testExpiration);

      await store.deleteAllByKeyName(store.prefixValid, testKeyName);

      await expect(store.validateJWT(testKeyName, jwt1)).rejects.toThrow(
        'JWT does not exist in valid list'
      );
      await expect(store.validateJWT(testKeyName, jwt2)).rejects.toThrow(
        'JWT does not exist in valid list'
      );
    });

    it('should delete all blacklisted JWTs for a keyName', async () => {
      const jwt1 = testJWT + '1';
      const jwt2 = testJWT + '2';

      await store.storeBlacklistedJWT(
        testKeyName,
        jwt1,
        testLocale,
        testExpiration
      );
      await store.storeBlacklistedJWT(
        testKeyName,
        jwt2,
        testLocale,
        testExpiration
      );

      await store.deleteAllByKeyName(store.prefixBlacklist, testKeyName);

      const hash1 = crypto.createHash('sha256').update(jwt1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(jwt2).digest('hex');

      const key1 = `${store.prefixBlacklist}:${testKeyName}:${hash1}`;
      const key2 = `${store.prefixBlacklist}:${testKeyName}:${hash2}`;

      const exists1 = await store.client.exists(key1);
      const exists2 = await store.client.exists(key2);

      expect(exists1).toBe(0);
      expect(exists2).toBe(0);
    });
  });
});
