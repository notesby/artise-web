/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MenuItemConstructorOptions } from "electron";

let items: () => MenuItemConstructorOptions[] = () => [];

/**
 * Sets what the tray menu lists above Element's own items: the open workspaces.
 *
 * @param build - builds the items when Element builds its tray menu.
 */
export function setArtiseTrayItems(build: () => MenuItemConstructorOptions[]): void {
    items = build;
}

/** The tray menu's Artise items (the tray.ts hook): each open workspace with its unread count. */
export function artiseTrayItems(): MenuItemConstructorOptions[] {
    return items();
}
