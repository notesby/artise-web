/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { logger } from "matrix-js-sdk/src/logger";

import SettingsStore from "../../settings/SettingsStore";
import { SettingLevel } from "../../settings/SettingLevel";

/** Remembers, in this browser, that Artise's defaults were applied, so a person's later choice is never undone. */
export const DEFAULTS_APPLIED_KEY = "artise.defaultsApplied";

/**
 * Element settings Artise turns on once per browser, where the person hasn't chosen yet.
 *
 * - `feature_msc4095_url_preview_bundle` and `urlPreviewsEnabled_e2ee`: show the link previews the phones put in
 *   messages (MSC4095). With Element's "bundled only" (on by default), previews in encrypted chats come only from
 *   the message itself, so nobody's server or website is contacted to show them, as on the phones.
 *
 * Done at start instead of changing Element's defaults, which its own tests rely on.
 */
const DEFAULTS = ["feature_msc4095_url_preview_bundle", "urlPreviewsEnabled_e2ee"] as const;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/**
 * Whether this browser has stored a value for the setting, read where Element's device level keeps it
 * (`DeviceSettingsHandler`: features under `mx_labs_feature_<name>`, the rest in `mx_local_settings`). Read
 * directly because `SettingsStore` applies Element's requirements first, which can report "off" for an unset value.
 */
function hasStoredValue(name: (typeof DEFAULTS)[number], storage: Storage): boolean {
    if (name.startsWith("feature_")) return storage.getItem(`mx_labs_feature_${name}`) !== null;
    try {
        const settings: unknown = JSON.parse(storage.getItem("mx_local_settings") ?? "{}");
        return typeof settings === "object" && settings !== null && name in settings;
    } catch {
        return false;
    }
}

/**
 * Applies Artise's defaults the first time this browser runs Artise.
 *
 * @param storage - This browser's storage; nothing is done when it's blocked (the next visit tries again).
 */
export async function applyArtiseDefaults(storage: Storage | null): Promise<void> {
    try {
        if (!storage || storage.getItem(DEFAULTS_APPLIED_KEY)) return;
        for (const name of DEFAULTS) {
            if (!hasStoredValue(name, storage)) await SettingsStore.setValue(name, null, SettingLevel.DEVICE, true);
        }
        storage.setItem(DEFAULTS_APPLIED_KEY, "1");
    } catch (e) {
        logger.warn("Artise: couldn't apply Artise's defaults", e);
    }
}
