/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { ArtiseStickerPickerView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import BaseDialog from "../../components/views/dialogs/BaseDialog";
import { mediaFromMxc } from "../../customisations/Media";
import { getCurrentLanguage } from "../../languageHandler";
import { artiseT } from "../i18n/artiseT";
import { StickerPickerViewModel } from "./StickerPickerViewModel";
import { type StickerStore } from "./StickerStore";

interface StickerPickerDialogProps {
    client: MatrixClient;
    store: StickerStore;
    roomId: string;
    replyTo?: string;
    threadRoot?: string;
    onFinished: () => void;
}

/** The sticker picker in a dialog, from the composer's "+" menu. */
export function StickerPickerDialog({
    client,
    store,
    roomId,
    replyTo,
    threadRoot,
    onFinished,
}: Readonly<StickerPickerDialogProps>): JSX.Element {
    const vm = useCreateAutoDisposedViewModel(
        () =>
            new StickerPickerViewModel({
                client,
                store,
                language: getCurrentLanguage(),
                roomId,
                replyTo,
                threadRoot,
                thumbnail: (mxc) => {
                    const media = mediaFromMxc(mxc, client);
                    return media.getThumbnailOfSourceHttp(176, 176, "scale") ?? media.srcHttp ?? "";
                },
                onSent: onFinished,
            }),
    );
    return (
        <BaseDialog
            title={artiseT("artise|stickers|title")}
            onFinished={onFinished}
            className="mx_ArtiseStickerPickerDialog"
        >
            <ArtiseStickerPickerView vm={vm} />
        </BaseDialog>
    );
}
