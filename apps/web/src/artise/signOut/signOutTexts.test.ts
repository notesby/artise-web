/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { getSignOutTexts } from "./signOutTexts";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

function client(wellKnown: IClientWellKnown | undefined): MatrixClient {
    return { getClientWellKnown: () => wellKnown } as unknown as MatrixClient;
}

const NAMED = client({ "co.artise.workspace": { name: "Prueba MAS" } });

describe("getSignOutTexts", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    // In a browser: the workspace's name in the title, and "this browser" in the sentence.
    it("names the workspace and this browser", () => {
        expect(getSignOutTexts(NAMED, false)).toEqual({
            title: "Sign out of Prueba MAS?",
            description: "Your chats in Prueba MAS will no longer show in this browser. You can sign back in anytime.",
        });
    });

    // In the desktop app it's "this computer".
    it("says this computer in the desktop app", () => {
        expect(getSignOutTexts(NAMED, true)?.description).toBe(
            "Your chats in Prueba MAS will no longer show on this computer. You can sign back in anytime.",
        );
    });

    // An Artise workspace whose file has no name yet: Element's title stays, the sentence has no name.
    it("leaves the title to Element when the workspace has no name", () => {
        expect(getSignOutTexts(client({ "co.artise.workspace": {} }), false)).toEqual({
            title: undefined,
            description: "Your chats will no longer show in this browser. You can sign back in anytime.",
        });
    });

    // Not an Artise workspace: Element's texts.
    it("gives null on a server that isn't an Artise workspace", () => {
        expect(getSignOutTexts(client({ "m.homeserver": { base_url: "https://matrix.org" } }), false)).toBeNull();
    });
});
