import bcrypt from "bcryptjs";

// bcryptjs (pure JS, no native compilation step) over the more common
// native `bcrypt` package — this app runs across a plain local dev
// machine, this sandbox, and eventually Vercel's serverless functions;
// pure JS avoids any of those environments needing a matching prebuilt
// native binary for password hashing to work at all.
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
