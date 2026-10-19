/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React from "react";

import { type ModuleApi } from "../../modules/Api";
import { NotesPage } from "../notes/NotesPage";
import { NotesHeaderButton } from "../notes/NotesHeaderButton";
import { NOTES_SCREEN } from "../notes/notesLocation";
import { stickerUploadOption } from "../stickers/stickerOption";
import { applyArtiseDefaults } from "../settings/artiseDefaults";

function browserStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/**
 * Registers Artise's pages and buttons with Element's module API, once at start: the Notes page
 * (`#/notes?room=…`) and its button in a chat's header, and "Sticker" in the composer's "+" menu. Also turns on,
 * once per browser, the Element settings that show the link previews the phones send (`artiseDefaults.ts`).
 *
 * @param api - Element's module API.
 */
export function registerArtise(api: ModuleApi): void {
    api.navigation.registerLocationRenderer(NOTES_SCREEN, () => <NotesPage />);
    api.extras.addRoomHeaderButtonCallback((roomId) => <NotesHeaderButton key="artise-notes" roomId={roomId} />);
    api.composer.addFileUploadOption(stickerUploadOption());
    void applyArtiseDefaults(browserStorage());
}
