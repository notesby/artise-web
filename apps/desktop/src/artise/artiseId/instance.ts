/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { net, shell } from "electron";

import Store from "../../store.js";
import { ArtiseId } from "./ArtiseId.js";

let instance: ArtiseId | undefined;

function store(): Store {
    const value = Store.instance;
    if (!value) throw new Error("Element's store isn't ready yet");
    return value;
}

/**
 * The app's Artise ID: Chromium's network stack (so system proxies apply), Element's key store for the
 * refresh token, and the person's default browser for the sign-in pages.
 */
export function getArtiseId(): ArtiseId {
    instance ??= new ArtiseId({
        fetch: (url, init) => net.fetch(url, init),
        secrets: {
            get: (key) => store().getSecret(key),
            set: (key, value) => store().setSecret(key, value),
            delete: (key) => store().deleteSecret(key),
        },
        // Only Artise ID's https pages are opened here.
        openExternal: async (url) => {
            if (new URL(url).protocol === "https:") await shell.openExternal(url);
        },
        now: () => Date.now(),
    });
    return instance;
}
