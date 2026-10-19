/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, dialog, shell, type MenuItemConstructorOptions } from "electron";

import { artiseT } from "./i18n/artiseT.js";
import { isArtise, sourceCodeUrl } from "./variant.js";

/**
 * Shows "About Artise": the version, the AGPL licence and a button to this version's source code. Element
 * Desktop has no About on Windows and Linux, and the AGPL asks for the licence and the source offer to be
 * shown to the person.
 */
export async function showAbout(): Promise<void> {
    const version = app.getVersion();
    const options = {
        type: "info" as const,
        title: artiseT("artise|desktop|about|menu"),
        message: `Artise ${artiseT("artise|desktop|about|version", { version })}`,
        detail: artiseT("artise|desktop|about|license"),
        buttons: [artiseT("artise|desktop|about|source_code"), artiseT("artise|desktop|about|close")],
        defaultId: 1,
        cancelId: 1,
    };
    const { response } = global.mainWindow
        ? await dialog.showMessageBox(global.mainWindow, options)
        : await dialog.showMessageBox(options);
    if (response === 0) await shell.openExternal(sourceCodeUrl(version));
}

/**
 * Artise's items for the Help menu ("About Artise"), in the current language. Called each time Element
 * rebuilds its menu, which it does when the language changes, so this also refreshes the macOS About panel's
 * texts. Element's own builds get no items.
 */
export function artiseHelpMenuItems(): MenuItemConstructorOptions[] {
    if (!isArtise()) return [];
    const version = app.getVersion();
    app.setAboutPanelOptions({
        applicationName: "Artise",
        applicationVersion: version,
        version: "",
        copyright: artiseT("artise|desktop|about|license"),
        // Shown by macOS under the copyright, and by Linux as the dialog's link.
        credits: sourceCodeUrl(version),
        website: sourceCodeUrl(version),
    });
    return [
        { type: "separator" },
        {
            label: artiseT("artise|desktop|about|menu"),
            click(): void {
                void showAbout();
            },
        },
    ];
}
