const RedisJWTHashStore = require('../src/index');

(async () => {
  try {
    const store = new RedisJWTHashStore({
      redisOptions: { socket: { host: '127.0.0.1', port: 6379 } },
      prefixValid: 'valid-jwt',
      prefixBlacklist: 'blacklisted-jwt',
    });

    const rawJWT = 'eyJhbGcis...'; // Some JWT from your user
    const userKey = 'user123'; // e.g. userId
    const locale = '127.0.0.1'; // example IP
    const expirationInSeconds = 600; // 1 minute

    await store.connect();

    // Store it as valid
    await store.storeValidJWT(userKey, rawJWT, locale, expirationInSeconds);

    // Validate -> should succeed
    await store.validateJWT(userKey, rawJWT);
    // eslint-disable-next-line no-console
    console.log('Validation successful.');

    // Blacklist the JWT
    await store.storeBlacklistedJWT(
      userKey,
      rawJWT,
      locale,
      expirationInSeconds
    );

    // Validate -> should fail now
    try {
      await store.validateJWT(userKey, rawJWT);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Expected validation error:', err.message);
    }

    // Cleanup all records for this user
    await store.deleteAllByKeyName(store.prefixValid, userKey);
    await store.deleteAllByKeyName(store.prefixBlacklist, userKey);

    store.client.disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error:', err);
  }
})();
