import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

// Argon2id with the first configuration of the OWASP Password Storage Cheat Sheet (m=19 MiB, t=2, p=1).
// Pinned explicitly so a library upgrade cannot silently change it; verify() reads the parameters
// encoded in each stored PHC string. `2` is Algorithm.Argon2id (a const enum unusable under isolatedModules).
const ARGON2ID_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, ARGON2ID_OPTIONS);
}

/** Fails closed: a malformed stored hash verifies as false rather than throwing. */
export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Argon2id hash of a random, discarded secret, computed with the same parameters as real hashes.
 * Logins for unknown or unusable accounts verify against it so they pay the same hashing cost.
 */
export function getDummyPasswordHash() {
  return (dummyHash ??= hashPassword(randomBytes(32).toString("base64url")));
}

export const passwordHasher = { hash: hashPassword, verify: verifyPassword, dummyHash: getDummyPasswordHash };
export type PasswordHasher = typeof passwordHasher;
