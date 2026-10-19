/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";

import { ArtiseId, type ArtiseIdDeps, REFRESH_TOKEN_SECRET, SIGN_IN_URL, WORKSPACES_URL } from "./ArtiseId.js";
import { challenge } from "./pkce.js";

// A fake Artise ID and api.artise.co: each test sets how the token endpoint answers.

const SIGN_IN = {
    issuer: "https://id.artise.co",
    desktop_client_id: "395738224594584139",
    desktop_redirect_uri: "co.artise.desktop:/vector/webapp/",
    scopes: ["openid", "offline_access"],
    providers: { google: "395415843124544075" },
};
const DISCOVERY = {
    issuer: "https://id.artise.co",
    authorization_endpoint: "https://id.artise.co/oauth/v2/authorize",
    token_endpoint: "https://id.artise.co/oauth/v2/token",
    revocation_endpoint: "https://id.artise.co/oauth/v2/revoke",
    end_session_endpoint: "https://id.artise.co/oidc/v1/end_session",
};

type TokenAnswer = { status: number; body: unknown };

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setUp(): {
    artiseId: ArtiseId;
    deps: ArtiseIdDeps;
    keyStore: Map<string, string>;
    tokenRequests: URLSearchParams[];
    revoked: URLSearchParams[];
    answerTokens: (answer: (form: URLSearchParams) => TokenAnswer | Promise<TokenAnswer>) => void;
    workspacesSeen: string[];
    clock: { now: number };
} {
    const keyStore = new Map<string, string>();
    const tokenRequests: URLSearchParams[] = [];
    const revoked: URLSearchParams[] = [];
    const workspacesSeen: string[] = [];
    const clock = { now: 1_000_000 };
    let tokenAnswer: (form: URLSearchParams) => TokenAnswer | Promise<TokenAnswer> = () => ({ status: 500, body: {} });

    const deps: ArtiseIdDeps = {
        fetch: vi.fn(async (url: string, init?: RequestInit) => {
            if (url === SIGN_IN_URL) return json(200, SIGN_IN);
            if (url === "https://id.artise.co/.well-known/openid-configuration") return json(200, DISCOVERY);
            if (url === DISCOVERY.token_endpoint) {
                const form = new URLSearchParams(init?.body as string);
                tokenRequests.push(form);
                const { status, body } = await tokenAnswer(form);
                return json(status, body);
            }
            if (url === DISCOVERY.revocation_endpoint) {
                revoked.push(new URLSearchParams(init?.body as string));
                return new Response(null, { status: 200 });
            }
            if (url === WORKSPACES_URL) {
                const auth = new Headers(init?.headers).get("Authorization") ?? "";
                workspacesSeen.push(auth);
                if (auth !== "Bearer access-2" && auth !== "Bearer access-1") return json(401, {});
                return json(200, {
                    workspaces: [{ slug: "mas-k8s", name: "Prueba MAS", server_name: "mas-k8s.artise.co" }],
                });
            }
            return json(404, {});
        }),
        secrets: {
            get: async (key) => keyStore.get(key),
            set: async (key, value) => {
                keyStore.set(key, value);
            },
            delete: async (key) => {
                keyStore.delete(key);
            },
        },
        openExternal: vi.fn(async () => {}),
        now: () => clock.now,
        onExpired: vi.fn(),
    };
    return {
        artiseId: new ArtiseId(deps),
        deps,
        keyStore,
        tokenRequests,
        revoked,
        answerTokens: (answer) => {
            tokenAnswer = answer;
        },
        workspacesSeen,
        clock,
    };
}

/** Signs in through the fake browser: Artise ID sends the code back to the app. */
async function signIn(world: ReturnType<typeof setUp>): Promise<void> {
    vi.mocked(world.deps.openExternal).mockImplementationOnce(async (url) => {
        const state = new URL(url).searchParams.get("state");
        setTimeout(() => world.artiseId.handleReturn(`co.artise.desktop:/vector/webapp/?code=the-code&state=${state}`));
    });
    const result = await world.artiseId.signIn("google");
    expect(result).toEqual({ ok: true, value: undefined });
}

describe("ArtiseId", () => {
    let world: ReturnType<typeof setUp>;

    beforeEach(() => {
        world = setUp();
        world.answerTokens((form) =>
            form.get("grant_type") === "authorization_code"
                ? { status: 200, body: { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 } }
                : { status: 500, body: {} },
        );
    });

    describe("signing in", () => {
        it("opens Artise ID in the browser and trades the code with the PKCE verifier", async () => {
            await signIn(world);

            const opened = new URL(vi.mocked(world.deps.openExternal).mock.calls[0][0]);
            expect(opened.searchParams.get("client_id")).toBe("395738224594584139");
            expect(opened.searchParams.get("scope")).toContain("urn:zitadel:iam:org:idp:id:395415843124544075");

            const [exchange] = world.tokenRequests;
            expect(Object.fromEntries(exchange)).toMatchObject({
                grant_type: "authorization_code",
                code: "the-code",
                client_id: "395738224594584139",
                redirect_uri: "co.artise.desktop:/vector/webapp/",
            });
            // The verifier sent matches the challenge in the page that was opened.
            expect(challenge(exchange.get("code_verifier")!)).toBe(opened.searchParams.get("code_challenge"));
        });

        it("keeps only the refresh token, in the key store", async () => {
            await signIn(world);
            expect(world.keyStore.get(REFRESH_TOKEN_SECRET)).toBe("refresh-1");
            expect([...world.keyStore.values()]).not.toContain("access-1");
            expect(await world.artiseId.accessToken()).toEqual({ ok: true, value: "access-1" });
        });

        it("ends as cancelled when the person goes back", async () => {
            const signingIn = world.artiseId.signIn();
            await vi.waitFor(() => expect(world.deps.openExternal).toHaveBeenCalled());
            world.artiseId.cancelSignIn();
            expect(await signingIn).toEqual({ ok: false, error: "cancelled" });
            expect(world.tokenRequests).toEqual([]);
        });

        it("ends as cancelled when the person cancels on Artise ID's page", async () => {
            vi.mocked(world.deps.openExternal).mockImplementationOnce(async (url) => {
                const state = new URL(url).searchParams.get("state");
                setTimeout(() =>
                    world.artiseId.handleReturn(`co.artise.desktop:/vector/webapp/?error=access_denied&state=${state}`),
                );
            });
            expect(await world.artiseId.signIn()).toEqual({ ok: false, error: "cancelled" });
        });

        it("takes Artise ID's returns away from Element Web, even stale ones", () => {
            // A return with no sign-in in progress (an old tab) is still swallowed, never loaded as a page.
            expect(world.artiseId.handleReturn("co.artise.desktop:/vector/webapp/?code=x&state=artise-id.old")).toBe(
                true,
            );
            // A workspace's return (MAS for Element Web) is left to Element.
            expect(world.artiseId.handleReturn("co.artise.desktop:/vector/webapp/?code=x&state=abc")).toBe(false);
        });

        it("says sign-in isn't available while the server lacks the desktop's client", async () => {
            vi.mocked(world.deps.fetch).mockImplementation(async () => json(200, { issuer: "https://id.artise.co" }));
            expect(await world.artiseId.signIn()).toEqual({ ok: false, error: "not_available" });
            expect(world.deps.openExternal).not.toHaveBeenCalled();
        });
    });

    describe("refreshing", () => {
        beforeEach(async () => {
            await signIn(world);
            world.tokenRequests.length = 0;
            world.clock.now += 3600 * 1000; // the access token has expired
        });

        it("runs one refresh for parallel callers", async () => {
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            world.answerTokens(async () => {
                await gate;
                return {
                    status: 200,
                    body: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 },
                };
            });

            const calls = Promise.all([
                world.artiseId.accessToken(),
                world.artiseId.accessToken(),
                world.artiseId.workspaces(),
            ]);
            await vi.waitFor(() => expect(world.tokenRequests).toHaveLength(1));
            release();
            const [a, b, workspaces] = await calls;

            expect(world.tokenRequests).toHaveLength(1);
            expect(a).toEqual({ ok: true, value: "access-2" });
            expect(b).toEqual({ ok: true, value: "access-2" });
            expect(workspaces).toEqual({
                ok: true,
                value: [
                    { slug: "mas-k8s", name: "Prueba MAS", serverName: "mas-k8s.artise.co", homeserverUrl: undefined },
                ],
            });
        });

        it("saves the rotated refresh token before handing out the new access token", async () => {
            let savedWhenAnswered: string | undefined;
            const set = world.deps.secrets.set;
            world.deps.secrets.set = async (key, value): Promise<void> => {
                await set(key, value);
                savedWhenAnswered = world.keyStore.get(REFRESH_TOKEN_SECRET);
            };
            world.answerTokens(() => ({
                status: 200,
                body: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 },
            }));

            const token = await world.artiseId.accessToken();
            expect(token).toEqual({ ok: true, value: "access-2" });
            expect(savedWhenAnswered).toBe("refresh-2");
            expect(Object.fromEntries(world.tokenRequests[0])).toMatchObject({
                grant_type: "refresh_token",
                refresh_token: "refresh-1",
                client_id: "395738224594584139",
            });
        });

        it("signs the person out when Artise ID refuses the refresh token", async () => {
            // invalid_grant: unused for 90 days, older than 365, or revoked from another device.
            world.answerTokens(() => ({ status: 400, body: { error: "invalid_grant" } }));
            expect(await world.artiseId.accessToken()).toEqual({ ok: false, error: "expired" });
            expect(world.keyStore.has(REFRESH_TOKEN_SECRET)).toBe(false);
            expect(world.deps.onExpired).toHaveBeenCalled();
            expect(await world.artiseId.isSignedIn()).toBe(false);
        });

        it("keeps the refresh token when Artise ID can't be reached", async () => {
            world.answerTokens(() => ({ status: 503, body: {} }));
            expect(await world.artiseId.accessToken()).toEqual({ ok: false, error: "unreachable" });
            expect(world.keyStore.get(REFRESH_TOKEN_SECRET)).toBe("refresh-1");
            expect(world.deps.onExpired).not.toHaveBeenCalled();
        });

        it("picks up a refresh token kept from an earlier run", async () => {
            const restarted = new ArtiseId(world.deps);
            world.answerTokens(() => ({
                status: 200,
                body: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 },
            }));
            expect(await restarted.isSignedIn()).toBe(true);
            expect(await restarted.accessToken()).toEqual({ ok: true, value: "access-2" });
            expect(world.tokenRequests[0].get("refresh_token")).toBe("refresh-1");
        });
    });

    describe("signing out", () => {
        beforeEach(async () => {
            await signIn(world);
        });

        it("gives the refresh token back and forgets it", async () => {
            await world.artiseId.signOut(false);
            expect(Object.fromEntries(world.revoked[0])).toEqual({
                token: "refresh-1",
                token_type_hint: "refresh_token",
                client_id: "395738224594584139",
            });
            expect(world.keyStore.has(REFRESH_TOKEN_SECRET)).toBe(false);
            expect(await world.artiseId.isSignedIn()).toBe(false);
            expect(world.deps.openExternal).toHaveBeenCalledTimes(1); // only the sign-in page
        });

        it("also signs out in the browser when the last workspace is left", async () => {
            await world.artiseId.signOut(true);
            expect(vi.mocked(world.deps.openExternal).mock.calls.at(-1)?.[0]).toBe(
                "https://id.artise.co/oidc/v1/end_session?client_id=395738224594584139",
            );
        });

        it("forgets the token even when Artise ID can't be told", async () => {
            vi.mocked(world.deps.fetch).mockRejectedValue(new Error("offline"));
            await world.artiseId.signOut(false);
            expect(world.keyStore.has(REFRESH_TOKEN_SECRET)).toBe(false);
        });
    });
});
