/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";

import SettingsStore from "../../settings/SettingsStore";
import { SettingLevel } from "../../settings/SettingLevel";
import { DEFAULTS_APPLIED_KEY, applyArtiseDefaults } from "./artiseDefaults";

const NAMES = ["feature_msc4095_url_preview_bundle", "urlPreviewsEnabled_e2ee"] as const;

/** What this browser has stored for a setting, where Element's device level keeps it. */
const stored = (name: (typeof NAMES)[number]): boolean | null => {
    if (name.startsWith("feature_")) {
        const value = localStorage.getItem(`mx_labs_feature_${name}`);
        return value === null ? null : value === "true";
    }
    const settings = JSON.parse(localStorage.getItem("mx_local_settings") ?? "{}") as Record<string, boolean>;
    return settings[name] ?? null;
};

// Element's real settings store, on this browser's storage.
describe("applyArtiseDefaults", () => {
    beforeEach(() => {
        // Element's device settings keep a cache over localStorage, emptied when another tab clears it.
        localStorage.clear();
        window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    // First run: the bundle feature and previews in encrypted chats are on, "bundled only" stays on.
    it("turns on bundled link previews the first time", async () => {
        expect(NAMES.map(stored)).toEqual([null, null]);
        await applyArtiseDefaults(localStorage);
        expect(NAMES.map(stored)).toEqual([true, true]);
        expect(SettingsStore.getValue("feature_msc4095_url_preview_bundle")).toBe(true);
        // "Bundled only" is Element's default: previews in encrypted chats come only from the message.
        expect(SettingsStore.getDefaultValue("urlPreviewsEnabled_e2ee_bundled_only")).toBe(true);
        expect(localStorage.getItem(DEFAULTS_APPLIED_KEY)).toBe("1");
    });

    // A person who turned previews off keeps them off: applied once, never again.
    it("never undoes the person's choice", async () => {
        await applyArtiseDefaults(localStorage);
        await SettingsStore.setValue("urlPreviewsEnabled_e2ee", null, SettingLevel.DEVICE, false);
        await applyArtiseDefaults(localStorage);
        expect(stored("urlPreviewsEnabled_e2ee")).toBe(false);
    });

    // A choice made before Artise's first run is kept too.
    it("keeps a choice made before", async () => {
        await SettingsStore.setValue("urlPreviewsEnabled_e2ee", null, SettingLevel.DEVICE, false);
        await applyArtiseDefaults(localStorage);
        expect(NAMES.map(stored)).toEqual([true, false]);
    });

    it("does nothing without storage", async () => {
        await applyArtiseDefaults(null);
        expect(NAMES.map(stored)).toEqual([null, null]);
    });
});
