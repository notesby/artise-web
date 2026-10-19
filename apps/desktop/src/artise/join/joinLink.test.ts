/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

import { lookUpWorkspace, parseJoinLink } from "./joinLink.js";

describe("parseJoinLink", () => {
    it("reads the join page's desktop link", () => {
        // family-wiki bot/joinpage.py desktop_link: co.artise.desktop://join?workspace=<slug>&code=<code>
        expect(parseJoinLink("co.artise.desktop://join?workspace=acme&code=Ab3_x-9Q")).toEqual({
            slug: "acme",
            code: "Ab3_x-9Q",
        });
    });

    it.each([
        "co.artise.desktop://join?workspace=ACME&code=Ab3_x-9Q", // slugs are lower case
        "co.artise.desktop://join?workspace=acme&code=abc", // codes are 6-64 characters
        "co.artise.desktop://join?workspace=acme&code=Ab3 x-9Q",
        "co.artise.desktop://other?workspace=acme&code=Ab3_x-9Q",
        "co.artise.desktop:/vector/webapp/?workspace=acme&code=Ab3_x-9Q",
        "https://join.artise.co/acme/Ab3_x-9Q",
        "not a link",
    ])("refuses %s", (link) => {
        expect(parseJoinLink(link)).toBeUndefined();
    });
});

describe("lookUpWorkspace", () => {
    const answer = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });
    // api.artise.co/v1/workspaces/mas-k8s on 2026-10-18.
    const MAS_K8S = {
        slug: "mas-k8s",
        name: "Prueba MAS",
        server_name: "mas-k8s.artise.co",
        homeserver_url: "https://matrix.mas-k8s.artise.co",
        status: "active",
        join_url: "https://chat.mas-k8s.artise.co/join",
    };

    it("finds an active workspace and its join page", async () => {
        const fetch = vi.fn(async () => answer(200, MAS_K8S));
        expect(await lookUpWorkspace("mas-k8s", fetch)).toEqual({
            found: {
                slug: "mas-k8s",
                name: "Prueba MAS",
                serverName: "mas-k8s.artise.co",
                joinUrl: "https://chat.mas-k8s.artise.co/join",
            },
        });
        expect(fetch).toHaveBeenCalledWith("https://api.artise.co/v1/workspaces/mas-k8s", expect.anything());
    });

    it("treats any status but active as paused", async () => {
        const result = await lookUpWorkspace("mas-k8s", async () => answer(200, { ...MAS_K8S, status: "migrating" }));
        expect(result).toHaveProperty("suspended");
    });

    it.each([
        [404, "not_found"],
        [429, "rate_limited"],
        [500, "unreachable"],
    ])("reads %s as %s", async (status, expected) => {
        expect(await lookUpWorkspace("x", async () => answer(status, {}))).toBe(expected);
    });

    it("refuses a join page that isn't https, and a server name that isn't one", async () => {
        const plain = await lookUpWorkspace("mas-k8s", async () =>
            answer(200, { ...MAS_K8S, join_url: "http://x/join" }),
        );
        expect(plain).toMatchObject({ found: { joinUrl: undefined } });
        expect(await lookUpWorkspace("x", async () => answer(200, { ...MAS_K8S, server_name: "a/b" }))).toBe(
            "unreachable",
        );
    });

    it("is unreachable offline", async () => {
        expect(
            await lookUpWorkspace("x", async () => {
                throw new Error("offline");
            }),
        ).toBe("unreachable");
    });
});
