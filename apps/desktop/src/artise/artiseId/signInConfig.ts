/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { minDesktopVersion as minDesktopVersionOf } from "../workspace/discovery.js";

/** The sign-in providers Artise ID can open directly. */
export type ArtiseIdProvider = "apple" | "google" | "microsoft";

const PROVIDERS: readonly ArtiseIdProvider[] = ["apple", "google", "microsoft"];

/** Where Artise ID sends the desktop app back: Element Desktop's own sign-in return, on Artise's scheme. */
export const DESKTOP_REDIRECT_URI = "co.artise.desktop:/vector/webapp/";

/** How the desktop app signs in to Artise ID, from `GET https://api.artise.co/v1/sign-in`. */
export interface SignInConfig {
    issuer: string;
    /** The desktop's own Artise ID app (`desktop_client_id`), not the phones'. */
    clientId: string;
    redirectUri: string;
    scopes: string[];
    /** Artise ID's id for each provider, for the scope that opens it directly. */
    providers: Partial<Record<ArtiseIdProvider, string>>;
    /** The oldest Artise desktop Artise ID still signs in (`min_app_version.desktop`), as `1.2.3`. */
    minDesktopVersion?: string;
}

/** The issuer's endpoints, from its OpenID discovery document. */
export interface Endpoints {
    authorization: string;
    token: string;
    /** Where the refresh token is given back at the last sign-out. */
    revocation?: string;
    /** Where the browser signs out of Artise ID. */
    endSession?: string;
}

/** An id, scope or client ID: letters, digits and a few separators, never spaces or quotes. */
function isToken(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9._:~-]{1,200}$/.test(value);
}

function httpsUrl(value: unknown): URL | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url : undefined;
    } catch {
        return undefined;
    }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

/**
 * Reads `/v1/sign-in` for the desktop app. Undefined unless it has an https issuer and the desktop's client
 * ID, and its return address is exactly the desktop's: a return to anywhere else would never reach the app.
 *
 * @param body - the parsed JSON answer.
 */
export function parseSignInConfig(body: unknown): SignInConfig | undefined {
    const object = asObject(body);
    const issuer = httpsUrl(object?.issuer);
    const clientId = object?.desktop_client_id;
    const redirectUri = object?.desktop_redirect_uri ?? DESKTOP_REDIRECT_URI;
    if (!object || !issuer || !isToken(clientId) || redirectUri !== DESKTOP_REDIRECT_URI) return undefined;

    const scopes = Array.isArray(object.scopes) ? object.scopes.filter(isToken) : [];
    const providers: SignInConfig["providers"] = {};
    const listed = asObject(object.providers) ?? {};
    for (const provider of PROVIDERS) {
        if (isToken(listed[provider])) providers[provider] = listed[provider];
    }
    const minDesktopVersion = minDesktopVersionOf(object.min_app_version);
    return {
        issuer: issuer.href.replace(/\/$/, ""),
        clientId,
        redirectUri,
        scopes: scopes.length ? scopes : ["openid"],
        providers,
        ...(minDesktopVersion ? { minDesktopVersion } : {}),
    };
}

/**
 * Reads the issuer's discovery document. Undefined unless it is this issuer's and its endpoints are https;
 * the revocation and sign-out endpoints must also be on the issuer's host.
 *
 * @param body - the parsed JSON answer.
 * @param issuer - the issuer from {@link SignInConfig}.
 */
export function parseEndpoints(body: unknown, issuer: string): Endpoints | undefined {
    const object = asObject(body);
    const documentIssuer = httpsUrl(object?.issuer);
    const authorization = httpsUrl(object?.authorization_endpoint);
    const token = httpsUrl(object?.token_endpoint);
    if (!documentIssuer || documentIssuer.href.replace(/\/$/, "") !== issuer || !authorization || !token) {
        return undefined;
    }
    const issuerHost = new URL(issuer).host;
    const sameHost = (url: URL | undefined): string | undefined => (url?.host === issuerHost ? url.href : undefined);
    return {
        authorization: authorization.href,
        token: token.href,
        revocation: sameHost(httpsUrl(object?.revocation_endpoint)),
        endSession: sameHost(httpsUrl(object?.end_session_endpoint)),
    };
}

/**
 * The scopes to ask for: Artise's, plus the one that opens a provider directly (none for "Continue with
 * email"), as the phones do.
 *
 * @param config - the sign-in config.
 * @param provider - Google, Microsoft or Apple, or none.
 */
export function scopesFor(config: SignInConfig, provider?: ArtiseIdProvider): string[] {
    const id = provider ? config.providers[provider] : undefined;
    return id ? [...config.scopes, `urn:zitadel:iam:org:idp:id:${id}`] : config.scopes;
}
