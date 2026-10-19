/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { artiseTrayItems, setArtiseTrayItems } from "./trayItems.js";

describe("artiseTrayItems", () => {
    it("is empty until the workspaces are open, then lists them", () => {
        // Element's own builds, and Artise before a workspace opens, keep Element's tray menu as it is.
        expect(artiseTrayItems()).toEqual([]);
        setArtiseTrayItems(() => [{ label: "Casa (3)" }]);
        expect(artiseTrayItems()).toEqual([{ label: "Casa (3)" }]);
    });
});
