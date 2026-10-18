/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    ClientEvent,
    type ClientEventHandlerMap,
    type IClientWellKnown,
    type MatrixClient,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { WHATS_NEW_EDITION, WHATS_NEW_SEEN_KEY, WhatsNewViewModel, type WhatsNewStorage } from "./WhatsNewViewModel";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const ARTISE: IClientWellKnown = { "co.artise.workspace": { name: "Prueba MAS" } };

class FakeClient extends TypedEventEmitter<
    ClientEvent.ClientWellKnown,
    Pick<ClientEventHandlerMap, ClientEvent.ClientWellKnown>
> {
    public constructor(public wellKnown: IClientWellKnown | undefined) {
        super();
    }
    public getClientWellKnown = (): IClientWellKnown | undefined => this.wellKnown;
}

function memoryStorage(initial: Record<string, string> = {}): WhatsNewStorage & { data: Record<string, string> } {
    const data = { ...initial };
    return {
        data,
        getItem: (key) => data[key] ?? null,
        setItem: (key, value) => {
            data[key] = value;
        },
    };
}

/** `wellKnown: null` is a client whose well-known hasn't arrived yet. */
function makeVm(storage: WhatsNewStorage | null, wellKnown: IClientWellKnown | null = ARTISE) {
    const client = new FakeClient(wellKnown ?? undefined);
    return { vm: new WhatsNewViewModel({ client: client as unknown as MatrixClient, storage }), client };
}

describe("WhatsNewViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    // A browser that hasn't dismissed this edition sees the card with the release's three lines.
    it("shows this edition's changes", () => {
        const { vm } = makeVm(memoryStorage());
        expect(vm.getSnapshot()).toMatchObject({ visible: true, title: "What's new", doneLabel: "Got it" });
        expect(vm.getSnapshot().items).toHaveLength(3);
    });

    // An older edition dismissed: the new one shows.
    it("shows again for a new edition", () => {
        const { vm } = makeVm(memoryStorage({ [WHATS_NEW_SEEN_KEY]: "2026-01-01" }));
        expect(vm.getSnapshot().visible).toBe(true);
    });

    // "Got it" hides it and remembers this edition; the next visit doesn't show it.
    it("stays hidden once dismissed", () => {
        const storage = memoryStorage();
        const { vm } = makeVm(storage);
        vm.dismiss();
        expect(vm.getSnapshot().visible).toBe(false);
        expect(storage.data[WHATS_NEW_SEEN_KEY]).toBe(WHATS_NEW_EDITION);
        expect(makeVm(storage).vm.getSnapshot().visible).toBe(false);
    });

    // Not an Artise workspace: never shown.
    it("is hidden on a server that isn't an Artise workspace", () => {
        const { vm } = makeVm(memoryStorage(), { "m.homeserver": { base_url: "https://matrix.org" } });
        expect(vm.getSnapshot().visible).toBe(false);
    });

    // The workspace file arrives after the chat list: the card appears then.
    it("appears when the workspace file arrives late", () => {
        const { vm, client } = makeVm(memoryStorage(), null);
        expect(vm.getSnapshot().visible).toBe(false);
        client.wellKnown = ARTISE;
        client.emit(ClientEvent.ClientWellKnown, ARTISE);
        expect(vm.getSnapshot().visible).toBe(true);
    });

    // Storage that throws (blocked site data): it shows, and dismissing still hides it for this visit.
    it("works without storage", () => {
        const throwing: WhatsNewStorage = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: () => {
                throw new Error("SecurityError");
            },
        };
        const { vm } = makeVm(throwing);
        expect(vm.getSnapshot().visible).toBe(true);
        vm.dismiss();
        expect(vm.getSnapshot().visible).toBe(false);
    });
});
