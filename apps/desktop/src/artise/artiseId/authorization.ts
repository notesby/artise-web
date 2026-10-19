/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { challenge, randomToken } from "./pkce.js";
import { type ArtiseIdProvider, type Endpoints, type SignInConfig, scopesFor } from "./signInConfig.js";

/**
 * Artise ID's returns carry a state starting with this, so the shell tells them apart from a workspace's
 * sign-in return, which Element Web handles (and whose state Element Desktop marks with its own suffix).
 */
export const STATE_PREFIX = "artise-id.";

/** One sign-in attempt: authorization code with PKCE (S256). */
export interface Authorization {
    state: string;
    verifier: string;
    url: string;
}

/** Why a sign-in didn't finish. */
export type ArtiseIdError =
    /** The person closed or cancelled the sign-in page. */
    | "cancelled"
    /** Artise ID refused the sign-in or its tokens. */
    | "refused"
    /** No answer, or one the app can't read. */
    | "unreachable"
    /** The sign-in has to be done again (the refresh token expired or was revoked). */
    | "expired"
    /** Artise's server doesn't offer desktop sign-in yet. */
    | "not_available";

export type Result<T> = { ok: true; value: T } | { ok: false; error: ArtiseIdError };

/**
 * Starts a sign-in attempt: the page to open in the person's browser, and the secrets to finish it with.
 *
 * @param config - the sign-in config.
 * @param endpoints - the issuer's endpoints.
 * @param provider - the provider to open directly, if the person picked one.
 */
export function authorize(config: SignInConfig, endpoints: Endpoints, provider?: ArtiseIdProvider): Authorization {
    const state = STATE_PREFIX + randomToken();
    const verifier = randomToken();
    const url = new URL(endpoints.authorization);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("scope", scopesFor(config, provider).join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return { state, verifier, url: url.href };
}

/**
 * Whether a link that opened the app is one of Artise ID's returns.
 *
 * @param link - the link, e.g. `co.artise.desktop:/vector/webapp/?code=…&state=artise-id.…`.
 */
export function isArtiseIdReturn(link: string): boolean {
    try {
        return new URL(link).searchParams.get("state")?.startsWith(STATE_PREFIX) ?? false;
    } catch {
        return false;
    }
}

/**
 * The code in Artise ID's return, only when it answers this attempt.
 *
 * @param link - the return link.
 * @param authorization - the attempt it should answer.
 */
export function codeFromReturn(link: string, authorization: Authorization): Result<string> | undefined {
    let params: URLSearchParams;
    try {
        params = new URL(link).searchParams;
    } catch {
        return undefined;
    }
    if (params.get("state") !== authorization.state) return undefined;
    const error = params.get("error");
    if (error) return { ok: false, error: error === "access_denied" ? "cancelled" : "refused" };
    const code = params.get("code");
    return code ? { ok: true, value: code } : { ok: false, error: "refused" };
}
