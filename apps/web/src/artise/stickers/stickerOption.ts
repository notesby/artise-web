/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import StickerIcon from "@vector-im/compound-design-tokens/assets/web/icons/sticker";
import { type ComposerApiFileUploadOption } from "@element-hq/element-web-module-api";

import Modal from "../../Modal";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import RightPanelStore from "../../stores/right-panel/RightPanelStore";
import { artiseT } from "../i18n/artiseT";
import { StickerPickerDialog } from "./StickerPickerDialog";
import { stickerStoreFor } from "./stickerStores";

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
                store: stickerStoreFor(client),
                roomId,
                replyTo: relation?.inReplyToEventId,
                threadRoot,
            });
        },
    };
}
