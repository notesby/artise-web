/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import fs from "node:fs";
import path from "node:path";

/** Each open workspace's unread count, from its web app's `setBadgeCount`, and their total. */
export class UnreadCounts {
    private readonly counts = new Map<string, number>();
    private readonly listeners = new Set<() => void>();

    /**
     * Records a workspace's count.
     *
     * @param key - the workspace's key.
     * @param count - what its web app reports.
     */
    public set(key: string, count: number): void {
        const value = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
        if (this.counts.get(key) === value) return;
        this.counts.set(key, value);
        this.listeners.forEach((listener) => listener());
    }

    /**
     * Forgets a closed workspace's count.
     *
     * @param key - the workspace's key.
     */
    public remove(key: string): void {
        if (this.counts.delete(key)) this.listeners.forEach((listener) => listener());
    }

    /**
     * One workspace's count.
     *
     * @param key - the workspace's key.
     */
    public of(key: string): number {
        return this.counts.get(key) ?? 0;
    }

    /** Every workspace's count added up: the dock and taskbar badge. */
    public get total(): number {
        let total = 0;
        for (const count of this.counts.values()) total += count;
        return total;
    }

    /**
     * Calls back on every change, for the rail and the tray.
     *
     * @param listener - what to call.
     */
    public onChange(listener: () => void): void {
        this.listeners.add(listener);
    }
}

/**
 * Windows' taskbar badge for a total: one of the overlays tools/artise/desktop_icons.py draws, packaged in
 * resources/build/overlay/. None for 0, or when running unpackaged.
 *
 * @param total - every workspace's unread count.
 * @param buildDir - resources/build/, where the app's icons are.
 */
export function overlayImage(total: number, buildDir: string): Buffer | undefined {
    if (total <= 0) return undefined;
    try {
        return fs.readFileSync(path.join(buildDir, "overlay", total > 9 ? "9plus.png" : `${total}.png`));
    } catch {
        return undefined;
    }
}
