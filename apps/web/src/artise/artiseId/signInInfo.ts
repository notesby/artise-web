/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { logger } from "matrix-js-sdk/src/logger";

/** Artise's public API, the same for every workspace. */
export const ARTISE_API = "https://api.artise.co";

/** How long to wait for `/v1/sign-in` before going on without it, as the phones do. */
const TIMEOUT_MS = 6000;

/** What the web reads from `GET /v1/sign-in`. Every field is optional. */
export interface SignInInfo {
    /** Artise ID's page for two-step verification and sign-in methods. */
    securityUrl?: string;
}

function httpsUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        return new URL(value).protocol === "https:" ? value : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Reads Artise ID's public sign-in information.
 *
 * Nothing here needs a token: the web signs in through the workspace's own sign-in page and never holds an
 * Artise ID token, so it only uses the public parts.
 *
 * @param fetchFn - `fetch`, replaceable in tests.
 * @returns What it could read, or `null` when the API is down, slow or answers something unreadable.
 */
export async function fetchSignInInfo(fetchFn: typeof fetch = fetch): Promise<SignInInfo | null> {
    try {
        const response = await fetchFn(`${ARTISE_API}/v1/sign-in`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) return null;
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null) return null;
        return { securityUrl: httpsUrl((body as Record<string, unknown>).security_url) };
    } catch (e) {
        logger.warn("Artise: couldn't read /v1/sign-in", e);
        return null;
    }
}
