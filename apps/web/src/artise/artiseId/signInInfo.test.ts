/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi } from "vitest";

import { fetchSignInInfo } from "./signInInfo";

const answer = (status: number, body: unknown): typeof fetch =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("fetchSignInInfo", () => {
    it("reads security_url from api.artise.co/v1/sign-in", async () => {
        const fetchFn = answer(200, {
            issuer: "https://id.artise.co",
            security_url: "https://id.artise.co/ui/console/users/me?id=security",
        });
        expect(await fetchSignInInfo(fetchFn)).toEqual({
            securityUrl: "https://id.artise.co/ui/console/users/me?id=security",
        });
        expect(fetchFn).toHaveBeenCalledWith("https://api.artise.co/v1/sign-in", expect.anything());
    });

    it("drops a security_url that isn't https", async () => {
        expect(await fetchSignInInfo(answer(200, { security_url: "javascript:alert(1)" }))).toEqual({
            securityUrl: undefined,
        });
    });

    it("returns null when the API answers with an error", async () => {
        expect(await fetchSignInInfo(answer(503, { error: "down" }))).toBeNull();
    });

    it("returns null when the request fails", async () => {
        const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
        expect(await fetchSignInInfo(fetchFn)).toBeNull();
    });
});
