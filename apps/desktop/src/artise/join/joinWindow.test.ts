/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: vi.fn(), shell: { openExternal: vi.fn() } }));

const { joinNavigation } = await import("./joinWindow.js");

const PAGE = "https://chat.mas-k8s.artise.co/join/Ab3_x-9Q";

describe("joinNavigation", () => {
    it("keeps the join page's own site and join.artise.co in the window", () => {
        expect(joinNavigation("https://chat.mas-k8s.artise.co/join/Ab3_x-9Q?lang=es", PAGE)).toBe("stay");
        expect(joinNavigation("https://join.artise.co/mas-k8s/Ab3_x-9Q", PAGE)).toBe("stay");
    });

    it("sends other sites to the browser", () => {
        expect(joinNavigation("https://artise.co/privacy", PAGE)).toBe("external");
        expect(joinNavigation("https://play.google.com/store/apps/details?id=co.artise.app", PAGE)).toBe("external");
    });

    it("finishes on the page's own 'Abrir en la computadora'", () => {
        expect(joinNavigation("co.artise.desktop://join?workspace=mas-k8s&code=Ab3_x-9Q", PAGE)).toBe("done");
    });

    it("blocks anything that isn't https", () => {
        expect(joinNavigation("http://chat.mas-k8s.artise.co/join", PAGE)).toBe("block");
        expect(joinNavigation("file:///etc/passwd", PAGE)).toBe("block");
        expect(joinNavigation("javascript:alert(1)", PAGE)).toBe("block");
    });
});
