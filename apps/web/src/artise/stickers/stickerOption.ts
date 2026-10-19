/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import StickerIcon from "@vector-im/compound-design-tokens/assets/web/icons/sticker";
import { type ComposerApiFileUploadOption } from "@element-hq/element-web-module-api";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import Modal from "../../Modal";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import RightPanelStore from "../../stores/right-panel/RightPanelStore";
import { artiseT } from "../i18n/artiseT";
import { StickerPickerDialog } from "./StickerPickerDialog";
import { StickerStore } from "./StickerStore";

/** One store per signed-in client, so pack writes are queued together. */
let current: { client: MatrixClient; store: StickerStore } | null = null;

function storeFor(client: MatrixClient): StickerStore {
    if (current?.client !== client) current = { client, store: new StickerStore(client) };
    return current.store;
}

/**
 * "Sticker" in the composer's "+" menu (Element's module API, `addFileUploadOption`): opens the picker, which
 * sends to the chat, as a reply or in the open thread when the composer was.
 */
export function stickerUploadOption(): ComposerApiFileUploadOption {
    return {
        type: "co.artise.sticker",
        label: artiseT("artise|stickers|option"),
        icon: StickerIcon,
        onSelected: (roomId, view, relation) => {
            const client = MatrixClientPeg.get();
            if (!client || !roomId) return;
            const threadRoot =
                view?.view === "thread"
                    ? RightPanelStore.instance.currentCardForRoom(roomId).state?.threadHeadEvent?.getId()
                    : undefined;
            Modal.createDialog(StickerPickerDialog, {
                client,
                store: storeFor(client),
                roomId,
                replyTo: relation?.inReplyToEventId,
                threadRoot,
            });
        },
    };
}

/** The store for saving received stickers ("Guardar en mis stickers"). */
export function stickerStoreFor(client: MatrixClient): StickerStore {
    return storeFor(client);
}
