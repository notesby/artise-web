/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { parseEndpoints, parseSignInConfig, scopesFor } from "./signInConfig.js";

// /v1/sign-in as api.artise.co answers it, with the desktop's fields (family-wiki PR #231).
const SIGN_IN = {
    issuer: "https://id.artise.co",
    client_id: "395423549856219219",
    redirect_uri: "https://join.artise.co/oauth",
    desktop_client_id: "395738224594584139",
    desktop_redirect_uri: "co.artise.desktop:/vector/webapp/",
    scopes: ["openid", "profile", "email", "offline_access"],
    providers: { apple: "395419033345720907", google: "395415843124544075", microsoft: "395417126111805523" },
};

describe("parseSignInConfig", () => {
    it("uses the desktop's own client, not the phones'", () => {
        expect(parseSignInConfig(SIGN_IN)).toEqual({
            issuer: "https://id.artise.co",
            clientId: "395738224594584139",
            redirectUri: "co.artise.desktop:/vector/webapp/",
            scopes: ["openid", "profile", "email", "offline_access"],
            providers: SIGN_IN.providers,
        });
    });

    it("isn't available before the server has the desktop's client", () => {
        // Today's answer, before PR #231: the app says desktop sign-in isn't ready instead of using the phones' app.
        const { desktop_client_id: _, desktop_redirect_uri: __, ...phonesOnly } = SIGN_IN;
        expect(parseSignInConfig(phonesOnly)).toBeUndefined();
    });

    it("refuses a return address the app can't receive", () => {
        expect(parseSignInConfig({ ...SIGN_IN, desktop_redirect_uri: "https://evil.example/cb" })).toBeUndefined();
    });

    it("refuses an issuer that isn't https", () => {
        expect(parseSignInConfig({ ...SIGN_IN, issuer: "http://id.artise.co" })).toBeUndefined();
    });

    it("drops scopes and provider ids that aren't plain tokens", () => {
        const config = parseSignInConfig({ ...SIGN_IN, scopes: ["openid", "a b"], providers: { google: "x y" } });
        expect(config?.scopes).toEqual(["openid"]);
        expect(config?.providers).toEqual({});
    });
});

describe("scopesFor", () => {
    const config = parseSignInConfig(SIGN_IN)!;

    it("opens Google directly, as the phones do", () => {
        expect(scopesFor(config, "google")).toContain("urn:zitadel:iam:org:idp:id:395415843124544075");
    });

    it("asks only Artise's scopes for 'Continue with email'", () => {
        expect(scopesFor(config)).toEqual(SIGN_IN.scopes);
    });
});

describe("parseEndpoints", () => {
    const DISCOVERY = {
        issuer: "https://id.artise.co",
        authorization_endpoint: "https://id.artise.co/oauth/v2/authorize",
        token_endpoint: "https://id.artise.co/oauth/v2/token",
        revocation_endpoint: "https://id.artise.co/oauth/v2/revoke",
        end_session_endpoint: "https://id.artise.co/oidc/v1/end_session",
    };

    it("reads Artise ID's endpoints", () => {
        expect(parseEndpoints(DISCOVERY, "https://id.artise.co")).toEqual({
            authorization: "https://id.artise.co/oauth/v2/authorize",
            token: "https://id.artise.co/oauth/v2/token",
            revocation: "https://id.artise.co/oauth/v2/revoke",
            endSession: "https://id.artise.co/oidc/v1/end_session",
        });
    });

    it("refuses another issuer's document", () => {
        expect(
            parseEndpoints({ ...DISCOVERY, issuer: "https://other.example" }, "https://id.artise.co"),
        ).toBeUndefined();
    });

    it("ignores a revocation endpoint on another host", () => {
        // The refresh token is only ever sent to Artise ID itself.
        const endpoints = parseEndpoints(
            { ...DISCOVERY, revocation_endpoint: "https://evil.example/revoke" },
            "https://id.artise.co",
        );
        expect(endpoints?.revocation).toBeUndefined();
    });
});
