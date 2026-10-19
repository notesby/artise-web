/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
    ClientEvent,
    type ClientEventHandlerMap,
    type MatrixClient,
    MatrixEvent,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { StickerPickerViewModel, type StickerPickerViewModelProps } from "./StickerPickerViewModel";
import { type StickerStore } from "./StickerStore";
import { type Sticker, USER_PACK_EVENT_TYPE } from "./imagePack";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const MINE: Sticker = {
    id: "sticker_1",
    description: "Luna feliz",
    url: "mxc://artise.co/luna",
    starter: false,
    width: 256,
    height: 256,
    mimeType: "image/webp",
    size: 10,
};
const CAT: Sticker = {
    ...MINE,
    id: "starter:cat",
    description: "Gato",
    url: "media/artise/stickers/starter/cat.webp",
    starter: true,
};

class FakeClient extends TypedEventEmitter<
    ClientEvent.AccountData,
    Pick<ClientEventHandlerMap, ClientEvent.AccountData>
> {}

function makeVm(mine: Sticker[] = [], overrides: Partial<StickerPickerViewModelProps> = {}) {
    let own = [...mine];
    const store = {
        mine: vi.fn(() => own),
        starter: vi.fn(() => [CAT]),
        send: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn(async (id: string) => {
            own = own.filter((s) => s.id !== id);
        }),
    };
    const client = new FakeClient();
    const props: StickerPickerViewModelProps = {
        client: client as unknown as MatrixClient,
        store: store as unknown as StickerStore,
        language: "es",
        roomId: "!r:x",
        thumbnail: (mxc) => `https://media/${mxc.slice(6)}`,
        onSent: vi.fn(),
        ...overrides,
    };
    return {
        vm: new StickerPickerViewModel(props),
        store,
        client,
        props,
        setMine: (next: Sticker[]) => (own = next),
    };
}

describe("StickerPickerViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    // Without stickers of their own, it opens on the starter pack, with its credit.
    it("opens on the starter pack for someone without stickers", () => {
        const { vm } = makeVm();
        expect(vm.getSnapshot()).toMatchObject({
            tab: "starter",
            stickers: [{ id: "starter:cat", description: "Gato", src: "media/artise/stickers/starter/cat.webp" }],
            credit: "Starter stickers: Fluent Emoji by Microsoft (MIT License)",
            removable: false,
        });
    });

    // With their own, it opens on those, drawn from thumbnails, removable.
    it("opens on the person's own when they have some", () => {
        const { vm } = makeVm([MINE]);
        expect(vm.getSnapshot()).toMatchObject({
            tab: "mine",
            stickers: [{ id: "sticker_1", src: "https://media/artise.co/luna" }],
            removable: true,
            credit: undefined,
        });
    });

    // Sending: as a reply / in a thread when the composer was; the picker closes.
    it("sends and closes", async () => {
        const { vm, store, props } = makeVm([], { replyTo: "$q", threadRoot: "$root" });
        vm.send("starter:cat");
        expect(vm.getSnapshot().busy).toBe(true);
        await vi.waitFor(() => expect(props.onSent).toHaveBeenCalled());
        expect(store.send).toHaveBeenCalledWith("!r:x", CAT, { replyTo: "$q", threadRoot: "$root" });
    });

    it("says when a sticker couldn't be sent", async () => {
        const { vm, store, props } = makeVm();
        store.send.mockRejectedValueOnce(new Error("offline"));
        vm.send("starter:cat");
        await vi.waitFor(() =>
            expect(vm.getSnapshot().error).toBe("Couldn't send the sticker. Check your connection and try again."),
        );
        expect(vm.getSnapshot().busy).toBe(false);
        expect(props.onSent).not.toHaveBeenCalled();
    });

    // Removing asks first, then the sticker is gone.
    it("removes one of the person's own after asking", async () => {
        const { vm, store } = makeVm([MINE]);
        vm.remove("sticker_1");
        expect(vm.getSnapshot().confirmRemove).toMatchObject({ id: "sticker_1", title: "Remove this sticker?" });
        vm.confirmRemoval();
        await vi.waitFor(() => expect(vm.getSnapshot().stickers).toEqual([]));
        expect(store.remove).toHaveBeenCalledWith("sticker_1");
        expect(vm.getSnapshot().emptyText).toContain("Stickers you save from chats show here");
    });

    // A sticker saved on the phone shows here when the account data syncs.
    it("shows stickers saved on another device", () => {
        const { vm, client, setMine } = makeVm([MINE]);
        setMine([MINE, { ...MINE, id: "sticker_2", description: "Sol" }]);
        client.emit(ClientEvent.AccountData, new MatrixEvent({ type: USER_PACK_EVENT_TYPE, content: {} }), undefined);
        expect(vm.getSnapshot().stickers.map((s) => s.description)).toEqual(["Luna feliz", "Sol"]);
    });
});
