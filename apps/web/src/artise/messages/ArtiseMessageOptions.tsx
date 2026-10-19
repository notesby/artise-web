/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { SaveToNotesOption } from "../notes/SaveToNotesOption";
import { SaveStickerOption } from "../stickers/SaveStickerOption";

/** Artise's entries in a message's menu; each shows only for the messages it fits. */
export function ArtiseMessageOptions(props: Readonly<{ mxEvent: MatrixEvent; onFinished: () => void }>): JSX.Element {
    return (
        <>
            <SaveToNotesOption {...props} />
            <SaveStickerOption {...props} />
        </>
    );
}
