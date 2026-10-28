/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

import { join, type JoinDeps } from "./joinFlow.js";
import { type Lookup } from "./joinLink.js";

const FOUND: Lookup = {
    found: {
        slug: "mas-k8s",
        name: "Prueba MAS",
        serverName: "mas-k8s.artise.co",
        joinUrl: "https://chat.mas-k8s.artise.co/join",
    },
};

function deps(lookup: Lookup, open: string[] = []): JoinDeps {
    return {
        lookUp: vi.fn(async () => lookup),
        isOpen: (serverName) => open.includes(serverName),
        show: vi.fn(),
        openJoinPage: vi.fn(async () => {}),
        openWorkspace: vi.fn(async () => ({ ok: true as const, value: undefined })),
        alert: vi.fn(),
    };
}

const INVITE = { slug: "mas-k8s", code: "Ab3_x-9Q" };

describe("join", () => {
    it("shows the join page, then opens the workspace and its sign-in", async () => {
        const app = deps(FOUND);
        await join(INVITE, app);
        expect(app.openJoinPage).toHaveBeenCalledWith("https://chat.mas-k8s.artise.co/join/Ab3_x-9Q");
        expect(app.openWorkspace).toHaveBeenCalledWith("mas-k8s.artise.co");
        expect(vi.mocked(app.openJoinPage).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(app.openWorkspace).mock.invocationCallOrder[0],
        );
    });

    it("just shows a workspace that's open already", async () => {
        const app = deps(FOUND, ["mas-k8s.artise.co"]);
        await join(INVITE, app);
        expect(app.show).toHaveBeenCalledWith("mas-k8s.artise.co");
        expect(app.openJoinPage).not.toHaveBeenCalled();
    });

    it.each([
        ["not_found", "artise|desktop|join|expired"],
        ["rate_limited", "artise|desktop|join|rate_limited"],
        ["unreachable", "artise|desktop|join|unreachable"],
    ] as const)("says why for %s", async (lookup, text) => {
        const app = deps(lookup);
        await join(INVITE, app);
        expect(app.alert).toHaveBeenCalledWith(text);
        expect(app.openWorkspace).not.toHaveBeenCalled();
    });

    it("says a paused workspace is paused", async () => {
        const app = deps({ suspended: { slug: "x", name: "X", serverName: "x.artise.co" } });
        await join(INVITE, app);
        expect(app.alert).toHaveBeenCalledWith("artise|desktop|join|paused");
    });

    it("goes straight to the sign-in for a workspace without a join page", async () => {
        const app = deps({ found: { slug: "old", name: "Old", serverName: "old.artise.co" } });
        await join(INVITE, app);
        expect(app.openJoinPage).not.toHaveBeenCalled();
        expect(app.openWorkspace).toHaveBeenCalledWith("old.artise.co");
    });
});
