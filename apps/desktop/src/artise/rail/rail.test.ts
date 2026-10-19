/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

import { Rail, type RailDeps } from "./rail.js";

function setUp(fetched: Response = new Response("png", { headers: { "Content-Type": "image/png" } })): {
    rail: Rail;
    deps: RailDeps;
} {
    const deps: RailDeps = {
        items: () => [{ name: "Casa", initials: "CA", color: "#123456", hasLogo: true, unread: 0, shown: true }],
        logoUrl: (index) => (index === 0 ? "https://artise.co/brand/logo.png" : undefined),
        show: vi.fn(),
        fetch: vi.fn(async () => fetched),
        unreadLabel: (count) => `Sin leer: ${count}`,
        language: () => "es",
    };
    return { rail: new Rail(deps), deps };
}

const at = (path: string): URL => new URL(`artise-shell://shell${path}`);

describe("Rail", () => {
    it("shows the workspace a link asks for, then the rail again", async () => {
        const { rail, deps } = setUp();
        const answer = await rail.handle(at("/rail/show?i=0"));
        expect(deps.show).toHaveBeenCalledWith(0);
        expect(answer?.status).toBe(303);
        expect(answer?.headers.get("Location")).toBe("artise-shell://shell/rail");
    });

    it("serves a workspace's logo, downloaded once", async () => {
        const { rail, deps } = setUp();
        const first = await rail.handle(at("/rail/logo?i=0"));
        await rail.handle(at("/rail/logo?i=0"));
        expect(first?.headers.get("Content-Type")).toBe("image/png");
        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });

    it("refuses a logo that isn't an image", async () => {
        const { rail } = setUp(new Response("<html>", { headers: { "Content-Type": "text/html" } }));
        expect((await rail.handle(at("/rail/logo?i=0")))?.status).toBe(404);
        expect((await rail.handle(at("/rail/logo?i=5")))?.status).toBe(404);
    });

    it("leaves other paths to the shell", async () => {
        expect(await setUp().rail.handle(at("/"))).toBeUndefined();
    });
});
