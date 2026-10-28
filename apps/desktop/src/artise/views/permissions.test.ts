/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { allowPermission } from "./permissions.js";

describe("allowPermission", () => {
    it.each(["notifications", "media", "display-capture", "clipboard-sanitized-write", "fullscreen"])(
        "lets Artise's web app use %s",
        (permission) => {
            expect(allowPermission(permission, "vector://vector/webapp/")).toBe(true);
        },
    );

    it.each(["geolocation", "midi", "openExternal", "hid", "serial", "usb", "clipboard-read"])(
        "refuses %s",
        (permission) => {
            expect(allowPermission(permission, "vector://vector/webapp/")).toBe(false);
        },
    );

    it("refuses any other page", () => {
        // An embedded page from the internet (a widget, a link preview) gets nothing.
        expect(allowPermission("media", "https://evil.example/")).toBe(false);
        expect(allowPermission("notifications", "vector://vectorevil/")).toBe(false);
        expect(allowPermission("notifications", undefined)).toBe(false);
    });

    it("accepts the bare origin, as permission checks give it", () => {
        expect(allowPermission("notifications", "vector://vector")).toBe(true);
    });
});
