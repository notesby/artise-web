/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { ArtiseWhatsNewView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { WhatsNewViewModel, type WhatsNewStorage } from "./WhatsNewViewModel";

function browserStorage(): WhatsNewStorage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/** "What's new" above the chat list after an update, on Artise workspaces. */
export function WhatsNewCard(): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(() => new WhatsNewViewModel({ client, storage: browserStorage() }));
    return <ArtiseWhatsNewView vm={vm} />;
}
