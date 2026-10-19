/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { authorize, codeFromReturn, isArtiseIdReturn } from "./authorization.js";
import { challenge } from "./pkce.js";
import { type Endpoints, type SignInConfig } from "./signInConfig.js";

const CONFIG: SignInConfig = {
    issuer: "https://id.artise.co",
    clientId: "395738224594584139",
    redirectUri: "co.artise.desktop:/vector/webapp/",
    scopes: ["openid", "offline_access"],
    providers: { microsoft: "395417126111805523" },
};
const ENDPOINTS: Endpoints = {
    authorization: "https://id.artise.co/oauth/v2/authorize",
    token: "https://id.artise.co/oauth/v2/token",
};

describe("authorize", () => {
    const attempt = authorize(CONFIG, ENDPOINTS, "microsoft");
    const params = new URL(attempt.url).searchParams;

    it("asks for a code with PKCE S256, back to the desktop's scheme", () => {
        expect(attempt.url.startsWith("https://id.artise.co/oauth/v2/authorize?")).toBe(true);
        expect(Object.fromEntries(params)).toMatchObject({
            response_type: "code",
            client_id: "395738224594584139",
            redirect_uri: "co.artise.desktop:/vector/webapp/",
            code_challenge_method: "S256",
            code_challenge: challenge(attempt.verifier),
        });
    });

    it("opens the chosen provider directly", () => {
        expect(params.get("scope")).toBe("openid offline_access urn:zitadel:iam:org:idp:id:395417126111805523");
    });

    it("marks its state as Artise ID's, with a fresh random part each time", () => {
        expect(attempt.state).toMatch(/^artise-id\.[A-Za-z0-9_-]{43}$/);
        expect(authorize(CONFIG, ENDPOINTS).state).not.toBe(attempt.state);
        expect(attempt.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});

describe("returns", () => {
    const attempt = authorize(CONFIG, ENDPOINTS);
    const back = (query: string): string => `co.artise.desktop:/vector/webapp/?${query}`;

    it("tells Artise ID's returns from a workspace's", () => {
        expect(isArtiseIdReturn(back(`code=abc&state=${attempt.state}`))).toBe(true);
        // MAS's return for Element Web, with Element Desktop's profile suffix in the state.
        expect(isArtiseIdReturn(back("code=abc&state=xyz:element-desktop-ssoid:123"))).toBe(false);
        expect(isArtiseIdReturn("not a link")).toBe(false);
    });

    it("gives the code of this attempt", () => {
        expect(codeFromReturn(back(`code=abc&state=${attempt.state}`), attempt)).toEqual({ ok: true, value: "abc" });
    });

    it("ignores a return for another attempt", () => {
        // An old browser tab finishing an earlier sign-in must not finish this one.
        expect(codeFromReturn(back("code=abc&state=artise-id.other"), attempt)).toBeUndefined();
    });

    it("reads a cancelled sign-in", () => {
        expect(codeFromReturn(back(`error=access_denied&state=${attempt.state}`), attempt)).toEqual({
            ok: false,
            error: "cancelled",
        });
        expect(codeFromReturn(back(`error=server_error&state=${attempt.state}`), attempt)).toEqual({
            ok: false,
            error: "refused",
        });
    });
});
