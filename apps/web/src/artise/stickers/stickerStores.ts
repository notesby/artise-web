/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { StickerStore } from "./StickerStore";

/*
 * Kept apart from stickerOption.ts on purpose: the message menu's "Guardar en mis stickers" needs the store, and
 * importing the composer option from there (it reaches Element's RightPanelStore) makes an import cycle with
 * Element's message bodies.
 */

/** One store per signed-in client, so pack writes are queued together. */
let current: { client: MatrixClient; store: StickerStore } | null = null;

/** The sticker store for this client: the picker and "Guardar en mis stickers" share it. */
export function stickerStoreFor(client: MatrixClient): StickerStore {
    if (current?.client !== client) current = { client, store: new StickerStore(client) };
    return current.store;
}
