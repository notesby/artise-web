/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { isFresh, parseTokens } from "./tokens.js";

describe("parseTokens", () => {
    it("reads Artise ID's answer", () => {
        expect(
            parseTokens({ access_token: "a", refresh_token: "r", token_type: "Bearer", expires_in: 43200 }, 1000),
        ).toEqual({ accessToken: "a", refreshToken: "r", expiresAt: 1000 + 43200 * 1000 });
    });

    it("keeps the old refresh token when a refresh sends none", () => {
        expect(parseTokens({ access_token: "a2", expires_in: 60 }, 0, "r1")?.refreshToken).toBe("r1");
    });

    it("refuses an answer with no access token, or not a bearer token", () => {
        expect(parseTokens({ refresh_token: "r" }, 0)).toBeUndefined();
        expect(parseTokens({ access_token: "a", token_type: "mac" }, 0)).toBeUndefined();
        expect(parseTokens("nope", 0)).toBeUndefined();
    });
});

describe("isFresh", () => {
    it("wants a minute left", () => {
        expect(isFresh({ accessToken: "a", expiresAt: 61_000 }, 0)).toBe(true);
        expect(isFresh({ accessToken: "a", expiresAt: 59_000 }, 0)).toBe(false);
    });
});
