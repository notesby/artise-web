/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

vi.mock("./workspaceView.js", () => ({ createWorkspaceView: vi.fn() }));

const { shortcutIndex } = await import("./workspaceViews.js");

const key = (input: object): Parameters<typeof shortcutIndex>[0] => ({
    type: "keyDown",
    key: "1",
    control: false,
    meta: false,
    alt: false,
    shift: false,
    ...input,
});

describe("shortcutIndex", () => {
    it("is Ctrl+1…9 on Windows and Linux", () => {
        expect(shortcutIndex(key({ control: true, key: "1" }), "win32")).toBe(0);
        expect(shortcutIndex(key({ control: true, key: "9" }), "linux")).toBe(8);
    });

    it("is ⌘+1…9 on macOS", () => {
        expect(shortcutIndex(key({ meta: true, key: "2" }), "darwin")).toBe(1);
        expect(shortcutIndex(key({ control: true, key: "2" }), "darwin")).toBeUndefined();
    });

    it("leaves other keys to the web app", () => {
        expect(shortcutIndex(key({ control: true, key: "0" }), "win32")).toBeUndefined();
        expect(shortcutIndex(key({ control: true, shift: true }), "win32")).toBeUndefined();
        expect(shortcutIndex(key({ key: "1" }), "win32")).toBeUndefined();
        expect(shortcutIndex(key({ control: true, type: "keyUp" }), "win32")).toBeUndefined();
    });
});
