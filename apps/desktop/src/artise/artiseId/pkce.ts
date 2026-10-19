/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url: a valid PKCE verifier and a hard-to-guess state (RFC 7636). */
export function randomToken(): string {
    return randomBytes(32).toString("base64url");
}

/**
 * The S256 challenge for a verifier.
 *
 * @param verifier - the PKCE verifier.
 */
export function challenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}
