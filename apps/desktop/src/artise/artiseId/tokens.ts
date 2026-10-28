/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/** Artise ID's tokens. The access token stays in memory; only the refresh token is kept, in the OS key store. */
export interface Tokens {
    accessToken: string;
    refreshToken?: string;
    /** Milliseconds since the epoch. */
    expiresAt: number;
}

/**
 * Reads a token answer. A refresh that sends no new refresh token keeps the old one.
 *
 * @param body - the parsed JSON answer.
 * @param now - the current time, in milliseconds.
 * @param previousRefreshToken - the refresh token used, for a refresh.
 */
export function parseTokens(body: unknown, now: number, previousRefreshToken?: string): Tokens | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const object = body as Record<string, unknown>;
    const accessToken = object.access_token;
    const tokenType = typeof object.token_type === "string" ? object.token_type.toLowerCase() : "bearer";
    if (typeof accessToken !== "string" || !accessToken || tokenType !== "bearer") return undefined;
    const lifetime = typeof object.expires_in === "number" && object.expires_in > 0 ? object.expires_in : 300;
    const refreshToken =
        typeof object.refresh_token === "string" && object.refresh_token ? object.refresh_token : undefined;
    return { accessToken, refreshToken: refreshToken ?? previousRefreshToken, expiresAt: now + lifetime * 1000 };
}

/**
 * Whether the access token is still good for a minute or more.
 *
 * @param tokens - the tokens.
 * @param now - the current time, in milliseconds.
 */
export function isFresh(tokens: Tokens, now: number): boolean {
    return tokens.expiresAt - now > 60_000;
}
