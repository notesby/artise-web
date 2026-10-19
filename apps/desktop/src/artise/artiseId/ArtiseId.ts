/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    type ArtiseIdError,
    type Authorization,
    type Result,
    authorize,
    codeFromReturn,
    isArtiseIdReturn,
} from "./authorization.js";
import {
    type ArtiseIdProvider,
    type Endpoints,
    type SignInConfig,
    parseEndpoints,
    parseSignInConfig,
} from "./signInConfig.js";
import { type Tokens, isFresh, parseTokens } from "./tokens.js";

export const SIGN_IN_URL = "https://api.artise.co/v1/sign-in";
export const WORKSPACES_URL = "https://api.artise.co/v1/me/workspaces";

/** The name of the refresh token in the OS key store (Keychain on macOS, DPAPI on Windows). */
export const REFRESH_TOKEN_SECRET = "artise-id-refresh-token";

/** How long the sign-in config and the discovery document are kept. */
const CACHE_LIFETIME = 60 * 60 * 1000;
/** How long a sign-in waits for the browser to come back. */
const RETURN_TIMEOUT = 10 * 60 * 1000;
/** How long one request to Artise may take. */
const REQUEST_TIMEOUT = 15 * 1000;

/** A workspace the person belongs to, from `/v1/me/workspaces`. */
export interface ArtiseWorkspace {
    slug?: string;
    name: string;
    serverName: string;
    homeserverUrl?: string;
}

/** What Artise ID needs from the app: the network, the OS key store, the browser and a clock. */
export interface ArtiseIdDeps {
    fetch(url: string, init?: RequestInit): Promise<Response>;
    secrets: {
        get(key: string): Promise<string | undefined>;
        set(key: string, value: string): Promise<void>;
        delete(key: string): Promise<void>;
    };
    openExternal(url: string): Promise<void>;
    now(): number;
    /** Called when the person has to sign in again: their refresh token expired or was revoked. */
    onExpired?(): void;
}

interface Pending {
    authorization: Authorization;
    finish(link: string | undefined): void;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: ArtiseIdError): Result<T> => ({ ok: false, error });

/**
 * The person's Artise ID, in the main process: sign-in in their own browser (authorization code + PKCE, the
 * return through `co.artise.desktop:`), the tokens, and the list of their workspaces.
 *
 * The access token lives only in memory. The refresh token is kept in the OS key store; when Artise ID rotates
 * it, the new one is saved before it's used, so a crash never leaves only the spent one on disk. Refreshes go
 * through one lock, so two never run at once.
 */
export class ArtiseId {
    private config?: { value: SignInConfig; expiry: number };
    private endpointsCache?: { value: Endpoints; expiry: number };
    private tokens?: Tokens;
    private pending?: Pending;
    private refreshing?: Promise<Result<Tokens>>;

    public constructor(private readonly deps: ArtiseIdDeps) {}

    /** How to sign in, kept for an hour; undefined when Artise's server doesn't offer desktop sign-in yet. */
    public async signInConfig(): Promise<Result<SignInConfig>> {
        if (this.config && this.config.expiry > this.deps.now()) return ok(this.config.value);
        const answer = await this.getJson(SIGN_IN_URL);
        if (!answer.ok) return answer;
        const value = parseSignInConfig(answer.value);
        if (!value) return fail("not_available");
        this.config = { value, expiry: this.deps.now() + CACHE_LIFETIME };
        return ok(value);
    }

    private async endpoints(config: SignInConfig): Promise<Result<Endpoints>> {
        if (this.endpointsCache && this.endpointsCache.expiry > this.deps.now()) return ok(this.endpointsCache.value);
        const answer = await this.getJson(`${config.issuer}/.well-known/openid-configuration`);
        if (!answer.ok) return answer;
        const value = parseEndpoints(answer.value, config.issuer);
        if (!value) return fail("unreachable");
        this.endpointsCache = { value, expiry: this.deps.now() + CACHE_LIFETIME };
        return ok(value);
    }

    /**
     * Signs in: opens Artise ID in the person's browser and waits for it to come back to the app.
     *
     * @param provider - Google, Microsoft or Apple to open directly; none for "Continue with email".
     */
    public async signIn(provider?: ArtiseIdProvider): Promise<Result<void>> {
        const config = await this.signInConfig();
        if (!config.ok) return config;
        const endpoints = await this.endpoints(config.value);
        if (!endpoints.ok) return endpoints;

        this.cancelSignIn();
        const authorization = authorize(config.value, endpoints.value, provider);
        const returned = new Promise<string | undefined>((resolve) => {
            const timer = setTimeout(() => resolve(undefined), RETURN_TIMEOUT);
            this.pending = {
                authorization,
                finish: (link): void => {
                    clearTimeout(timer);
                    resolve(link);
                },
            };
        });
        await this.deps.openExternal(authorization.url);

        const link = await returned;
        if (this.pending?.authorization === authorization) this.pending = undefined;
        const code = link ? codeFromReturn(link, authorization) : undefined;
        if (!code) return fail("cancelled");
        if (!code.ok) return code;

        const tokens = await this.tokenRequest(endpoints.value.token, {
            grant_type: "authorization_code",
            code: code.value,
            redirect_uri: config.value.redirectUri,
            client_id: config.value.clientId,
            code_verifier: authorization.verifier,
        });
        if (!tokens.ok) return tokens;
        await this.keep(tokens.value, undefined);
        return ok(undefined);
    }

    /** Stops waiting for the browser: the person went back, or started another sign-in. */
    public cancelSignIn(): void {
        this.pending?.finish(undefined);
        this.pending = undefined;
    }

    /**
     * Takes Artise ID's return when it's one, so it never reaches Element Web.
     *
     * @param link - a link that opened the app.
     * @returns whether the link was Artise ID's (also when it answers no sign-in in progress).
     */
    public handleReturn(link: string): boolean {
        if (!isArtiseIdReturn(link)) return false;
        if (this.pending && codeFromReturn(link, this.pending.authorization)) this.pending.finish(link);
        return true;
    }

    /** Whether there's a sign-in to use: tokens in memory, or a refresh token in the key store. */
    public async isSignedIn(): Promise<boolean> {
        return !!this.tokens || !!(await this.deps.secrets.get(REFRESH_TOKEN_SECRET));
    }

    /** A usable access token, refreshed when it's about to expire. */
    public async accessToken(): Promise<Result<string>> {
        if (this.tokens && isFresh(this.tokens, this.deps.now())) return ok(this.tokens.accessToken);
        const tokens = await this.refresh();
        return tokens.ok ? ok(tokens.value.accessToken) : tokens;
    }

    /** Refreshes the tokens; parallel callers share the same refresh. */
    public refresh(): Promise<Result<Tokens>> {
        this.refreshing ??= this.reallyRefresh().finally(() => {
            this.refreshing = undefined;
        });
        return this.refreshing;
    }

    private async reallyRefresh(): Promise<Result<Tokens>> {
        const refreshToken = this.tokens?.refreshToken ?? (await this.deps.secrets.get(REFRESH_TOKEN_SECRET));
        if (!refreshToken) return fail("expired");
        const config = await this.signInConfig();
        if (!config.ok) return config;
        const endpoints = await this.endpoints(config.value);
        if (!endpoints.ok) return endpoints;

        const tokens = await this.tokenRequest(
            endpoints.value.token,
            { grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.value.clientId },
            refreshToken,
        );
        if (!tokens.ok) {
            if (tokens.error === "refused") {
                // invalid_grant: 90 days unused, 365 days at most, or revoked. The person signs in again.
                await this.forget();
                this.deps.onExpired?.();
                return fail("expired");
            }
            return tokens;
        }
        await this.keep(tokens.value, refreshToken);
        return tokens;
    }

    /** The workspaces the person is in. Never kept on disk. */
    public async workspaces(): Promise<Result<ArtiseWorkspace[]>> {
        let token = await this.accessToken();
        for (let attempt = 1; ; attempt++) {
            if (!token.ok) return token;
            const answer = await this.request(WORKSPACES_URL, { headers: { Authorization: `Bearer ${token.value}` } });
            if (!answer.ok) return answer;
            if (answer.value.status === 401 && attempt === 1) {
                // An access token refused before its time (revoked, or the clock is off): refresh once and retry.
                const refreshed = await this.refresh();
                token = refreshed.ok ? ok(refreshed.value.accessToken) : refreshed;
                continue;
            }
            if (answer.value.status === 404) return fail("not_available");
            if (answer.value.status !== 200) return fail("unreachable");
            const list = parseWorkspaces(await answer.value.json().catch(() => undefined));
            return list ? ok(list) : fail("unreachable");
        }
    }

    /**
     * Signs out of Artise ID: gives the refresh token back so it's refused from then on, and forgets it.
     * Best effort on the network: the token is forgotten here even when Artise ID can't be told.
     *
     * @param inBrowser - also sign out of Artise ID in the browser (the last workspace was left).
     */
    public async signOut(inBrowser: boolean): Promise<void> {
        const refreshToken = this.tokens?.refreshToken ?? (await this.deps.secrets.get(REFRESH_TOKEN_SECRET));
        const config = await this.signInConfig();
        const endpoints = config.ok ? await this.endpoints(config.value) : undefined;
        await this.forget();
        if (!config.ok || !endpoints?.ok) return;

        if (refreshToken && endpoints.value.revocation) {
            await this.request(endpoints.value.revocation, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    token: refreshToken,
                    token_type_hint: "refresh_token",
                    client_id: config.value.clientId,
                }).toString(),
            });
        }
        if (inBrowser && endpoints.value.endSession) {
            const url = new URL(endpoints.value.endSession);
            url.searchParams.set("client_id", config.value.clientId);
            await this.deps.openExternal(url.href);
        }
    }

    private async keep(tokens: Tokens, previousRefreshToken: string | undefined): Promise<void> {
        if (tokens.refreshToken && tokens.refreshToken !== previousRefreshToken) {
            try {
                await this.deps.secrets.set(REFRESH_TOKEN_SECRET, tokens.refreshToken);
            } catch (e) {
                // Still signed in until Artise quits; the next start asks to sign in again.
                console.error("Couldn't keep Artise ID's refresh token", e);
            }
        }
        this.tokens = tokens;
    }

    private async forget(): Promise<void> {
        this.tokens = undefined;
        await this.deps.secrets.delete(REFRESH_TOKEN_SECRET);
    }

    private async tokenRequest(
        url: string,
        form: Record<string, string>,
        previousRefreshToken?: string,
    ): Promise<Result<Tokens>> {
        const answer = await this.request(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
            body: new URLSearchParams(form).toString(),
        });
        if (!answer.ok) return answer;
        const { status } = answer.value;
        if (status !== 200) return fail(status >= 400 && status < 500 ? "refused" : "unreachable");
        const tokens = parseTokens(
            await answer.value.json().catch(() => undefined),
            this.deps.now(),
            previousRefreshToken,
        );
        return tokens ? ok(tokens) : fail("unreachable");
    }

    private async getJson(url: string): Promise<Result<unknown>> {
        const answer = await this.request(url, { headers: { Accept: "application/json" } });
        if (!answer.ok) return answer;
        if (answer.value.status === 404) return fail("not_available");
        if (answer.value.status !== 200) return fail("unreachable");
        const body: unknown = await answer.value.json().catch(() => undefined);
        return body === undefined ? fail("unreachable") : ok(body);
    }

    private async request(url: string, init: RequestInit): Promise<Result<Response>> {
        try {
            return ok(await this.deps.fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT) }));
        } catch {
            return fail("unreachable");
        }
    }
}

/**
 * Reads `/v1/me/workspaces`; entries without a server name are left out.
 *
 * @param body - the parsed JSON answer.
 */
export function parseWorkspaces(body: unknown): ArtiseWorkspace[] | undefined {
    const entries = (body as { workspaces?: unknown } | undefined)?.workspaces;
    if (!Array.isArray(entries)) return undefined;
    return entries.flatMap((entry: Record<string, unknown>) => {
        const serverName = typeof entry?.server_name === "string" ? entry.server_name.trim().toLowerCase() : "";
        if (!/^[a-z0-9.-]+(:\d+)?$/.test(serverName)) return [];
        const slug = typeof entry.slug === "string" && /^[a-z0-9-]{1,63}$/.test(entry.slug) ? entry.slug : undefined;
        const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : (slug ?? serverName);
        const homeserver = typeof entry.homeserver_url === "string" ? entry.homeserver_url : undefined;
        const homeserverUrl = homeserver?.startsWith("https://") ? homeserver : undefined;
        return [{ slug, name, serverName, homeserverUrl }];
    });
}
