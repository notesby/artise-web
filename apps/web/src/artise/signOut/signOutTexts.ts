/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { artiseT } from "../i18n/artiseT";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";

/** The sign-out confirmation's texts on an Artise workspace. */
export interface SignOutTexts {
    /** "¿Cerrar sesión en Prueba MAS?", or `undefined` (Element's "Cerrar sesión") while the name isn't known. */
    title?: string;
    /** What signing out does, here: the chats stop showing in this browser (or on this computer). */
    description: string;
}

/**
 * The sign-out confirmation's texts, naming the workspace as the phones do ("Cerrar sesión en {espacio}").
 *
 * There's no Artise ID sentence: the web holds no Artise ID session of its own to end.
 *
 * @param client - The signed-in client.
 * @param inDesktopApp - True inside the desktop app ("this computer" instead of "this browser").
 * @returns The texts, or `null` on a server that isn't an Artise workspace (Element's texts stay).
 */
export function getSignOutTexts(client: MatrixClient, inDesktopApp: boolean = !!window.electron): SignOutTexts | null {
    const workspace = getWorkspaceFile(client);
    if (!workspace) return null;
    const name = workspace.name;
    if (inDesktopApp) {
        return {
            title: name ? artiseT("artise|sign_out|title", { workspace: name }) : undefined,
            description: name
                ? artiseT("artise|sign_out|content_computer", { workspace: name })
                : artiseT("artise|sign_out|content_computer_unnamed"),
        };
    }
    return {
        title: name ? artiseT("artise|sign_out|title", { workspace: name }) : undefined,
        description: name
            ? artiseT("artise|sign_out|content_browser", { workspace: name })
            : artiseT("artise|sign_out|content_browser_unnamed"),
    };
}
