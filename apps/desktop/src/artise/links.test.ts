/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";

import { artiseHandlesLink, setLinkTargets, signInSessionId } from "./links.js";

vi.mock("./artiseId/instance.js", () => ({
    getArtiseId: () => ({ handleReturn: (link: string): boolean => link.includes("state=artise-id.") }),
}));

describe("signInSessionId", () => {
    it("reads Element Desktop's ID from the state, in the query or the fragment", () => {
        expect(
            signInSessionId(
                new URL("co.artise.desktop:/vector/webapp/?code=c&state=abc:element-desktop-ssoid:artise-1f"),
            ),
        ).toBe("artise-1f");
        expect(
            signInSessionId(
                new URL("co.artise.desktop:/vector/webapp/#code=c&state=abc:element-desktop-ssoid:artise-2a"),
            ),
        ).toBe("artise-2a");
        expect(signInSessionId(new URL("co.artise.desktop:/vector/webapp/?code=c&state=abc"))).toBeUndefined();
    });
});

describe("artiseHandlesLink", () => {
    const loaded: [string, string][] = [];
    const joined: object[] = [];

    beforeEach(() => {
        loaded.length = 0;
        joined.length = 0;
        vi.stubGlobal("mainWindow", { isMinimized: () => false, show: vi.fn(), focus: vi.fn() });
        setLinkTargets({
            join: (link) => joined.push(link),
            signInReturn: (sessionId, url) => {
                if (sessionId !== "artise-casa") return false;
                loaded.push([sessionId, url]);
                return true;
            },
        });
    });

    it("sends a workspace's sign-in return to that workspace's view", () => {
        // MAS for "Casa" answers while another workspace is shown: the code still goes to Casa's view.
        const link = "co.artise.desktop:/vector/webapp/?code=c&state=s:element-desktop-ssoid:artise-casa";
        expect(artiseHandlesLink(link)).toBe(true);
        expect(loaded).toEqual([
            ["artise-casa", "vector://vector/webapp/?code=c&state=s:element-desktop-ssoid:artise-casa"],
        ]);
    });

    it("leaves a return for no open workspace to Element", () => {
        expect(
            artiseHandlesLink("co.artise.desktop:/vector/webapp/?code=c&state=s:element-desktop-ssoid:artise-gone"),
        ).toBe(false);
        expect(artiseHandlesLink("co.artise.desktop:/vector/webapp/?code=c&state=s:element-desktop-ssoid:abc")).toBe(
            false,
        );
    });

    it("gives Artise ID's returns to the shell", () => {
        expect(artiseHandlesLink("co.artise.desktop:/vector/webapp/?code=c&state=artise-id.x")).toBe(true);
        expect(loaded).toEqual([]);
    });

    it("joins a workspace from the join page's desktop link", () => {
        expect(artiseHandlesLink("co.artise.desktop://join?workspace=mas-k8s&code=Ab3_x-9Q")).toBe(true);
        expect(joined).toEqual([{ slug: "mas-k8s", code: "Ab3_x-9Q" }]);
    });
});

describe("an invite that opens Artise", () => {
    it("waits for the shell, then joins", async () => {
        // A cold start from the join page: the link arrives before the shell is ready.
        vi.resetModules();
        vi.stubGlobal("mainWindow", null);
        const links = await import("./links.js");
        expect(links.artiseHandlesLink("co.artise.desktop://join?workspace=acme&code=Ab3_x-9Q")).toBe(true);
        const join = vi.fn();
        links.setLinkTargets({ join, signInReturn: () => false });
        expect(join).toHaveBeenCalledWith({ slug: "acme", code: "Ab3_x-9Q" });
    });
});
