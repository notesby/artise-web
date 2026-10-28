/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fs as memfs, vol } from "memfs";

import { readArtiseSettings, updateArtiseSettings } from "./settings.js";

const USER_DATA = "/home/ana/.config/Artise";

vi.mock("node:fs", () => ({ default: memfs }));
vi.mock("electron", () => ({ app: { getPath: (): string => "/home/ana/.config/Artise" } }));

describe("Artise's settings file", () => {
    beforeEach(() => {
        vol.reset();
    });

    it("is empty on a first start", () => {
        expect(readArtiseSettings()).toEqual({});
    });

    it("keeps the other settings when one changes", () => {
        updateArtiseSettings({ workspaceLanguage: "es" });
        updateArtiseSettings({ crashReports: true });
        expect(readArtiseSettings()).toEqual({ workspaceLanguage: "es", crashReports: true });
        expect(vol.existsSync(`${USER_DATA}/artise-settings.json`)).toBe(true);
    });

    it("starts over when the file is damaged", () => {
        // A half-written file mustn't stop Artise from opening; the person is just asked again.
        vol.fromJSON({ "artise-settings.json": "{ not json" }, USER_DATA);
        expect(readArtiseSettings()).toEqual({});
    });
});
