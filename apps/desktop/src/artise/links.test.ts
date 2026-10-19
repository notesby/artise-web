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

    beforeEach(() => {
        loaded.length = 0;
        vi.stubGlobal("mainWindow", { isMinimized: () => false, show: vi.fn(), focus: vi.fn() });
        setLinkTargets({
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
});
