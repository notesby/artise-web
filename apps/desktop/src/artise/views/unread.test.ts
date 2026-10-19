/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { overlayImage, UnreadCounts } from "./unread.js";

const iconsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artise/icons");

describe("UnreadCounts", () => {
    it("adds up every workspace's count", () => {
        const counts = new UnreadCounts();
        counts.set("casa", 3);
        counts.set("trabajo", 4);
        counts.set("casa", 1); // Casa's chats were read
        expect(counts.total).toBe(5);
        expect(counts.of("trabajo")).toBe(4);
        counts.remove("trabajo");
        expect(counts.total).toBe(1);
    });

    it("tells the rail and the tray only when something changed", () => {
        const counts = new UnreadCounts();
        const listener = vi.fn();
        counts.onChange(listener);
        counts.set("casa", 2);
        counts.set("casa", 2);
        counts.remove("nobody");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("treats nonsense from a page as nothing unread", () => {
        const counts = new UnreadCounts();
        counts.set("casa", -1);
        counts.set("trabajo", Number.NaN);
        expect(counts.total).toBe(0);
    });
});

describe("overlayImage", () => {
    it("picks the overlay with the total, 9+ above nine", () => {
        expect(overlayImage(3, iconsDir)?.equals(overlayImage(3, iconsDir)!)).toBe(true);
        expect(overlayImage(12, iconsDir)).toEqual(overlayImage(99, iconsDir));
        expect(overlayImage(12, iconsDir)).not.toEqual(overlayImage(9, iconsDir));
    });

    it("clears the overlay at zero, and when running unpackaged", () => {
        expect(overlayImage(0, iconsDir)).toBeUndefined();
        expect(overlayImage(3, "/nowhere")).toBeUndefined();
    });
});
