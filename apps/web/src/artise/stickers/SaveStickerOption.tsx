/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useContext } from "react";
import StickerIcon from "@vector-im/compound-design-tokens/assets/web/icons/sticker";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import MatrixClientContext from "../../contexts/MatrixClientContext";
import { IconizedContextMenuOption } from "../../components/views/context_menus/IconizedContextMenu";
import Modal from "../../Modal";
import InfoDialog from "../../components/views/dialogs/InfoDialog";
import ErrorDialog from "../../components/views/dialogs/ErrorDialog";
import { artiseT } from "../i18n/artiseT";
import { receivedSticker } from "./imagePack";
import { stickerStoreFor } from "./stickerStores";

/**
 * "Guardar en mis stickers" in a sticker message's menu, as on the phones: the sticker joins the person's own
 * (in their account, on all their devices). Not offered for a sticker they already have.
 */
export function SaveStickerOption({
    mxEvent,
    onFinished,
}: Readonly<{ mxEvent: MatrixEvent; onFinished: () => void }>): JSX.Element | null {
    // Optional: some of Element's menu tests render it with no client.
    const client = useContext(MatrixClientContext) ?? null;
    if (!client || mxEvent.getType() !== "m.sticker" || mxEvent.isRedacted()) return null;
    const sticker = receivedSticker(mxEvent.getContent());
    if (!sticker) return null;
    const store = stickerStoreFor(client);
    if (store.mine().some((mine) => mine.url === sticker.url)) return null;

    const onClick = async (): Promise<void> => {
        onFinished();
        try {
            await store.add(sticker);
            Modal.createDialog(InfoDialog, { title: artiseT("artise|stickers|saved") });
        } catch (e) {
            logger.warn("Artise: couldn't save a sticker", e);
            Modal.createDialog(ErrorDialog, { title: artiseT("artise|stickers|save_failed") });
        }
    };

    return (
        <IconizedContextMenuOption
            icon={<StickerIcon />}
            label={artiseT("artise|stickers|save")}
            onClick={() => void onClick()}
        />
    );
}
