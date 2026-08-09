import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * Cost factor 12. The right number is "as high as you can afford", and the
 * usual target is ~250ms per hash on the machine that will run it — slow enough
 * that offline cracking of a leaked database is impractical, fast enough that a
 * login does not feel broken. **Benchmark this on the actual VPS** and raise it
 * if hashing comes in well under that; a cost tuned on a development laptop is
 * usually too low for a server.
 *
 * Raising the cost later is safe: `verifyPassword` reads the cost from the
 * stored hash, so old hashes keep verifying, and `needsRehash` marks them for
 * upgrade at next successful login.
 */
const COST_FACTOR = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST_FACTOR);
}

/**
 * Verifies a password against a stored hash.
 *
 * Accepts `undefined` for the hash and still runs a dummy comparison. That is
 * deliberate: Google-only accounts have no password, and returning early would
 * make the response measurably faster for "no such user" than for "wrong
 * password", handing an attacker a way to enumerate registered emails by
 * timing alone.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plaintext, DUMMY_HASH);
    return false;
  }

  return bcrypt.compare(plaintext, hash);
}

/**
 * A real bcrypt hash at the current cost, of a value nothing will ever submit.
 * Its only purpose is to burn the same time a genuine comparison would.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO.ZQXqLm6cRz8H8cQ3D5CQ0kmZ2Bz2Xy";

/** True when a hash was made at a lower cost than the current setting. */
export function needsRehash(hash: string): boolean {
  const cost = Number.parseInt(hash.split("$")[2] ?? "0", 10);
  return Number.isFinite(cost) && cost < COST_FACTOR;
}

/**
 * Password policy.
 *
 * Length is the requirement that actually matters. Character-class rules mostly
 * push people toward `Password1!`, which is both harder to remember and no
 * harder to guess. A 10-character minimum with a blocklist of the obvious
 * choices does more real work.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "welcome123",
  "letmein123",
]);

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Please choose another.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Password cannot be a single repeated character";
  }
  return null;
}
