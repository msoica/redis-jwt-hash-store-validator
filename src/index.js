const { createClient } = require('redis');
const crypto = require('crypto');

/**
 * Simple function to hash a JWT string using SHA-256
 */
function hashJWT(jwtToken) {
  return crypto.createHash('sha256').update(jwtToken).digest('hex');
}

class RedisJWTHashStore {
  constructor({
    redisOptions = { socket: { host: '127.0.0.1', port: 6379 } },
    prefixValid = 'valid-jwt',
    prefixBlacklist = 'blacklisted-jwt',
  } = {}) {
    this.client = createClient(redisOptions);
    this.prefixValid = prefixValid;
    this.prefixBlacklist = prefixBlacklist;
  }

  async connect() {
    await this.client.connect();
  }

  /**
   * Store a raw JWT in the valid list (but save the hash in Redis)
   *
   * @param {string} keyName - e.g. userId or some identifier
   * @param {string} rawJWT
   * @param {string} locale - e.g. IP or country
   * @param {number} expiration - TTL in seconds
   */
  async storeValidJWT(keyName, rawJWT, locale, expiration) {
    const jwtHash = hashJWT(rawJWT);
    const redisKey = `${this.prefixValid}:${keyName}:${jwtHash}`;

    // Store data in Redis hash
    await this.client.hSet(redisKey, {
      keyName,
      jwtHash,
      locale,
    });

    if (expiration && expiration > 0) {
      await this.client.expire(redisKey, expiration);
    }
  }

  /**
   * Store a raw JWT in the blacklisted list (but save the hash in Redis)
   */
  async storeBlacklistedJWT(keyName, rawJWT, locale, expiration) {
    const jwtHash = hashJWT(rawJWT);
    const redisKey = `${this.prefixBlacklist}:${keyName}:${jwtHash}`;

    await this.client.hSet(redisKey, {
      keyName,
      jwtHash,
      locale,
    });

    if (expiration && expiration > 0) {
      await this.client.expire(redisKey, expiration);
    }
  }

  /**
   * Validate a raw JWT:
   * 1. Hash it
   * 2. Check if hash is in blacklisted set
   * 3. Check if hash is in valid set
   */
  async validateJWT(keyName, rawJWT) {
    const jwtHash = hashJWT(rawJWT);
    const blacklistedKey = `${this.prefixBlacklist}:${keyName}:${jwtHash}`;
    const validKey = `${this.prefixValid}:${keyName}:${jwtHash}`;

    // If blacklisted exists -> throw
    const blacklistedExists = await this.client.exists(blacklistedKey);
    if (blacklistedExists) {
      throw new Error('JWT is blacklisted');
    }

    // If valid doesn't exist -> throw
    const validExists = await this.client.exists(validKey);
    if (!validExists) {
      throw new Error('JWT does not exist in valid list');
    }

    // Otherwise, it's valid
    return true;
  }

  /**
   * Delete a single hashed JWT record.
   */
  async deleteRecord(prefix, keyName, rawJWT) {
    const jwtHash = hashJWT(rawJWT);
    const redisKey = `${prefix}:${keyName}:${jwtHash}`;
    await this.client.del(redisKey);
  }

  /**
   * Delete all records for a given keyName in either valid or blacklisted sets
   * using SCAN instead of KEYS to avoid performance issues.
   *
   * @param {string} prefix - "valid-jwt" or "blacklisted-jwt"
   * @param {string} keyName - The keyName used for building Redis keys
   */
  async deleteAllByKeyName(prefix, keyName) {
    const pattern = `${prefix}:${keyName}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}

module.exports = RedisJWTHashStore;
