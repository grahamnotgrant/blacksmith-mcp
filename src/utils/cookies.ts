/**
 * Cookie extraction from Chrome browser.
 *
 * Extracts the Blacksmith session cookie from Chrome's cookie storage.
 * This allows the MCP to work seamlessly if you're already logged into Blacksmith.
 *
 * On macOS, Chrome encrypts cookies using a key stored in the keychain.
 * We use the `security` CLI to retrieve the key and decrypt the cookies.
 */

import { execSync } from 'child_process';
import { createDecipheriv, pbkdf2Sync } from 'crypto';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { logger } from './logger.js';

const BLACKSMITH_DOMAIN = 'blacksmith.sh';
// Priority order: blacksmith_session (Laravel) > general session cookies
const COOKIE_NAMES = ['blacksmith_session', 'session', '__session', 'connect.sid'];

// Chrome cookie database paths by platform
const CHROME_COOKIE_PATHS: Record<string, string[]> = {
  darwin: [
    join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
    join(homedir(), 'Library/Application Support/Google/Chrome/Profile 1/Cookies'),
  ],
  linux: [
    join(homedir(), '.config/google-chrome/Default/Cookies'),
    join(homedir(), '.config/chromium/Default/Cookies'),
  ],
  win32: [
    join(
      process.env['LOCALAPPDATA'] || '',
      'Google/Chrome/User Data/Default/Network/Cookies'
    ),
  ],
};

interface ChromeCookie {
  name: string;
  value: string;
  encrypted_value: Buffer;
  host_key: string;
  path: string;
  expires_utc: number;
  is_httponly: number;
  is_secure: number;
}

/**
 * Get the Chrome encryption key from macOS keychain.
 */
function getMacOSEncryptionKey(): Buffer | null {
  try {
    const result = execSync(
      'security find-generic-password -s "Chrome Safe Storage" -w',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    // Derive the actual encryption key using PBKDF2
    // Chrome uses 'saltysalt' as salt and 1003 iterations
    const key = pbkdf2Sync(result, 'saltysalt', 1003, 16, 'sha1');
    return key;
  } catch {
    logger.warn('Could not retrieve Chrome encryption key from keychain');
    return null;
  }
}

/**
 * Decrypt a Chrome cookie value (macOS).
 * Chrome v10 encryption: AES-128-CBC with PBKDF2 derived key.
 *
 * The decrypted value often has a 32-byte MAC/metadata prefix before the actual
 * cookie content. For Laravel sessions, the actual value starts with 'eyJ' (base64).
 */
function decryptCookieValue(encryptedValue: Buffer, key: Buffer): string | null {
  try {
    // Check for v10 prefix (Chrome's encryption version marker)
    if (encryptedValue.slice(0, 3).toString() !== 'v10') {
      // Not encrypted or unknown format, try as plain text
      return encryptedValue.toString('utf-8');
    }

    // Remove 'v10' prefix
    const encrypted = encryptedValue.slice(3);

    // IV is 16 spaces for Chrome
    const iv = Buffer.alloc(16, ' ');

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // Remove PKCS7 padding
    const padding = decrypted[decrypted.length - 1];
    if (padding && padding <= 16) {
      decrypted = decrypted.slice(0, -padding);
    }

    // Chrome may prepend a 32-byte MAC/metadata. Look for actual content.
    // Laravel encrypted sessions start with 'eyJ' (base64 encoded JSON).
    const decryptedStr = decrypted.toString('utf-8');
    const base64Start = decryptedStr.indexOf('eyJ');
    if (base64Start > 0) {
      // Found Laravel-style encrypted payload, extract it
      return decryptedStr.slice(base64Start);
    }

    // If first bytes look like garbage (non-printable), skip the 32-byte MAC
    if (decrypted.length > 32 && decrypted[0] > 127) {
      const withoutMac = decrypted.slice(32).toString('utf-8');
      if (withoutMac.length > 0 && withoutMac.charCodeAt(0) < 127) {
        return withoutMac;
      }
    }

    return decryptedStr;
  } catch (error) {
    logger.debug('Failed to decrypt cookie value', error);
    return null;
  }
}

/**
 * Find the Chrome Cookies database file.
 */
function findCookieDatabase(): string | null {
  const platform = process.platform;
  const paths = CHROME_COOKIE_PATHS[platform];

  if (!paths) {
    logger.warn(`Unsupported platform for cookie extraction: ${platform}`);
    return null;
  }

  for (const cookiePath of paths) {
    if (existsSync(cookiePath)) {
      logger.debug(`Found Chrome cookie database at: ${cookiePath}`);
      return cookiePath;
    }
  }

  logger.warn('Chrome cookie database not found');
  return null;
}

/**
 * Extract Blacksmith session cookie from Chrome.
 * Returns the cookie value or null if not found.
 */
export async function extractBlacksmithCookie(): Promise<string | null> {
  try {
    logger.info('Attempting to extract Blacksmith cookie from Chrome...');

    const cookieDbPath = findCookieDatabase();
    if (!cookieDbPath) {
      return null;
    }

    // Get encryption key (macOS only for now)
    let encryptionKey: Buffer | null = null;
    if (process.platform === 'darwin') {
      encryptionKey = getMacOSEncryptionKey();
      if (!encryptionKey) {
        logger.warn('Could not get Chrome encryption key, will try unencrypted values');
      }
    }

    // Open the database in read-only mode
    const db = new Database(cookieDbPath, { readonly: true, fileMustExist: true });

    try {
      // Query for Blacksmith cookies
      const stmt = db.prepare(`
        SELECT name, value, encrypted_value, host_key, path,
               expires_utc, is_httponly, is_secure
        FROM cookies
        WHERE host_key LIKE ?
      `);

      const cookies = stmt.all(`%${BLACKSMITH_DOMAIN}%`) as ChromeCookie[];

      // Look for known session cookie names first
      for (const name of COOKIE_NAMES) {
        const cookie = cookies.find((c) => c.name === name);
        if (cookie) {
          const value = getCookieValue(cookie, encryptionKey);
          if (value) {
            logger.info(`Found Blacksmith session cookie: ${name}`);
            return value;
          }
        }
      }

      // Fall back to any cookie from blacksmith.sh
      for (const cookie of cookies) {
        const value = getCookieValue(cookie, encryptionKey);
        if (value) {
          logger.info(`Found Blacksmith cookie: ${cookie.name}`);
          return value;
        }
      }

      logger.warn('No Blacksmith session cookie found in Chrome');
      return null;
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('Failed to extract cookie from Chrome', error);
    return null;
  }
}

/**
 * Get the decrypted value of a cookie.
 */
function getCookieValue(cookie: ChromeCookie, encryptionKey: Buffer | null): string | null {
  // Try plain text value first (unencrypted cookies)
  if (cookie.value && cookie.value.length > 0) {
    return cookie.value;
  }

  // Try to decrypt encrypted value
  if (cookie.encrypted_value && cookie.encrypted_value.length > 0) {
    if (encryptionKey) {
      return decryptCookieValue(cookie.encrypted_value, encryptionKey);
    }
    logger.debug(`Cookie ${cookie.name} is encrypted but no decryption key available`);
  }

  return null;
}

/**
 * Get session cookie from environment or Chrome.
 * Priority: ENV var > Chrome extraction
 */
export async function getSessionCookie(): Promise<string | null> {
  // Check env var first
  const envCookie = process.env['BLACKSMITH_SESSION_COOKIE'];
  if (envCookie) {
    logger.info('Using session cookie from BLACKSMITH_SESSION_COOKIE env var');
    return envCookie;
  }

  // Try to extract from Chrome
  return extractBlacksmithCookie();
}
