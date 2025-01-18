# redis-jwt-hash-store

A lightweight Node.js library to **store**, **validate**, and **invalidate** JWTs in Redis using **hashed tokens**. It supports marking JWTs as valid or blacklisted, setting expiration, and uses the Redis `SCAN` command for efficient key deletion.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Constructor Options](#constructor-options)
  - [Store a Valid JWT](#store-a-valid-jwt)
  - [Store a Blacklisted JWT](#store-a-blacklisted-jwt)
  - [Validate a JWT](#validate-a-jwt)
  - [Delete a Single Record](#delete-a-single-record)
  - [Delete All Records by KeyName](#delete-all-records-by-keyname)
- [Hashing Method](#hashing-method)
- [Example](#example)
- [Notes](#notes)
- [License](#license)

---

## Features

1. **Hashing**: Securely stores **hashed** JWT strings, preventing direct exposure of tokens if Redis is compromised.
2. **Valid/Blacklisted Separation**: Maintains two distinct sets of JWTs—`valid-jwt` and `blacklisted-jwt`.
3. **Expiration**: Each stored JWT record can be assigned a **TTL** (Time-to-Live[redis-jwt-hash-store-docs.md](..%2F..%2F..%2FDownloads%2Fredis-jwt-hash-store-docs.md)).
4. **Efficient Key Deletion**: Uses the Redis [SCAN](https://redis.io/commands/scan) command to safely remove multiple keys without blocking Redis.
5. **Easy to Use**: Simple, minimal API for storing, validating, and removing JWTs by hash.

---

## Installation

```bash
npm install redis-jwt-hash-store
```

# Redis JWT Hash Store

## Constructor Options

```javascript
const RedisJWTHashStore = require('redis-jwt-hash-store');

const store = new RedisJWTHashStore({
  redisOptions: {
    socket: { host: '127.0.0.1', port: 6379 },
  },
  prefixValid: 'valid-jwt',
  prefixBlacklist: 'blacklisted-jwt',
});
```

- **redisOptions**: (Object) Connection options for the node-redis client
- **prefixValid**: (String) Key prefix for valid JWTs. Defaults to "valid-jwt"
- **prefixBlacklist**: (String) Key prefix for blacklisted JWTs. Defaults to "blacklisted-jwt"

## API Reference

### Store a Valid JWT

```javascript
/**
 * @param {string} keyName - Unique identifier for the user (e.g. userId).
 * @param {string} rawJWT  - The raw JWT string.
 * @param {string} locale  - Locale info, like IP or country.
 * @param {number} expiration - TTL in seconds.
 */
await store.storeValidJWT('user123', 'eyJhbGci...', '127.0.0.1', 3600);
```

Stores a hashed version of the JWT in Redis under the valid-jwt prefix. The expiration parameter sets how long the record remains in Redis (e.g., 3600 seconds = 1 hour).

### Store a Blacklisted JWT

```javascript
/**
 * @param {string} keyName    - Unique identifier for the user (e.g. userId).
 * @param {string} rawJWT     - The raw JWT string.
 * @param {string} locale     - Locale info, like IP or country.
 * @param {number} expiration - TTL in seconds.
 */
await store.storeBlacklistedJWT('user123', 'eyJhbGci...', '127.0.0.1', 3600);
```

Stores a hashed version of the JWT in Redis under the blacklisted-jwt prefix. Useful for immediately invalidating a token after logout, password change, etc.

### Validate a JWT

```javascript
/**
 * @param {string} keyName - The keyName used when the JWT was stored.
 * @param {string} rawJWT  - The raw JWT to validate.
 */
await store.validateJWT('user123', 'eyJhbGci...');
```

Checks if the hash of rawJWT:

- Exists in valid-jwt
- Does not exist in blacklisted-jwt

Throws an error if not valid or if blacklisted:

- "JWT is blacklisted"
- "JWT does not exist in valid list"

### Delete a Single Record

```javascript
/**
 * @param {string} prefix   - Either `store.prefixValid` or `store.prefixBlacklist`.
 * @param {string} keyName  - The keyName used when storing the JWT.
 * @param {string} rawJWT   - The raw JWT to remove from Redis.
 */
await store.deleteRecord(store.prefixValid, 'user123', 'eyJhbGci...');
```

Removes one specific hashed JWT record in either valid-jwt or blacklisted-jwt.

### Delete All Records by KeyName

```javascript
/**
 * @param {string} prefix  - Either `store.prefixValid` or `store.prefixBlacklist`.
 * @param {string} keyName - The keyName you want to remove.
 */
await store.deleteAllByKeyName(store.prefixValid, 'user123');
```

Removes all hashed JWT records for the specified keyName under valid-jwt or blacklisted-jwt. Uses Redis SCAN under the hood to avoid performance pitfalls of KEYS on large datasets.

## Hashing Method

The library uses SHA-256 (via Node's crypto module) to hash JWT strings. Storing only the hash instead of the raw JWT:

- Protects against attackers who might compromise Redis
- Ensures that no raw JWT tokens are stored in plain text

## Complete Example

```javascript
const RedisJWTHashStore = require('redis-jwt-hash-store');

(async () => {
  try {
    // 1. Create a new store instance
    const store = new RedisJWTHashStore({
      redisOptions: {
        socket: { host: '127.0.0.1', port: 6379 },
      },
      prefixValid: 'valid-jwt',
      prefixBlacklist: 'blacklisted-jwt',
    });

    // Sample data
    const rawJWT = 'eyJhbGciOiJIUzI1NiIsInR5...'; // Some JWT
    const userKey = 'user123';
    const locale = '127.0.0.1';
    const expirationInSeconds = 60; // 1 minute

    // 2. Store in valid JWT
    await store.storeValidJWT(userKey, rawJWT, locale, expirationInSeconds);
    console.log('Stored JWT in valid-jwt.');

    // 3. Validate -> should succeed
    await store.validateJWT(userKey, rawJWT);
    console.log('Validation successful.');

    // 4. Blacklist the same JWT
    await store.storeBlacklistedJWT(
      userKey,
      rawJWT,
      locale,
      expirationInSeconds
    );
    console.log('Blacklisted the JWT.');

    // 5. Validate again -> should fail
    try {
      await store.validateJWT(userKey, rawJWT);
    } catch (err) {
      console.error('Expected error after blacklisting:', err.message);
    }

    // 6. Delete all valid-jwt keys for user123
    await store.deleteAllByKeyName(store.prefixValid, userKey);
    console.log(`Deleted all valid-jwt records for ${userKey}.`);

    // 7. Disconnect
    store.client.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
})();
```
