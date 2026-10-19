/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi } from "vitest";
import { type MatrixClient, MatrixEvent } from "matrix-js-sdk/src/matrix";

import { StickerStore, UPLOADS_EVENT_TYPE } from "./StickerStore";
import { type Sticker, USER_PACK_EVENT_TYPE } from "./imagePack";

/** A client whose account data only changes "at the next sync" (when the test says so). */
function fakeClient(initial: Record<string, unknown> = {}) {
    const synced: Record<string, unknown> = { ...initial };
    const client = {
        getAccountData: vi.fn((type: string) =>
            type in synced ? new MatrixEvent({ type, content: synced[type] as object }) : undefined,
        ),
        setAccountData: vi.fn().mockResolvedValue({}),
        uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://artise.co/uploaded" }),
        sendEvent: vi.fn().mockResolvedValue({ event_id: "$s" }),
    };
    const sync = (): void => {
        for (const [type, content] of client.setAccountData.mock.calls) synced[type] = content;
    };
    return { client, sync, asClient: client as unknown as MatrixClient };
}

const GATO: Sticker = {
    id: "",
    description: "Gato",
    url: "mxc://artise.co/gato",
    starter: false,
    width: 256,
    height: 256,
    mimeType: "image/webp",
    size: 100,
};

describe("StickerStore", () => {
    // The starter pack: 48 stickers, in Spanish or English, pictures served with the app.
    it("lists the starter pack", () => {
        const { asClient } = fakeClient();
        const store = new StickerStore(asClient);
        const es = store.starter("es");
        expect(es).toHaveLength(48);
        expect(es[0]).toMatchObject({ id: "starter:grinning_squinting", description: "Riendo", starter: true });
        expect(es[0].url).toBe("media/artise/stickers/starter/grinning_squinting.webp");
        expect(store.starter("en")[0].description).toBe("Grinning squinting face");
    });

    // Two stickers saved one after the other, before the next sync: both stay (the phones' RecentAccountData).
    it("keeps both of two stickers saved together", async () => {
        const { client, asClient } = fakeClient();
        const store = new StickerStore(asClient);
        await Promise.all([
            store.add(GATO),
            store.add({ ...GATO, description: "Perro", url: "mxc://artise.co/perro" }),
        ]);
        const last = client.setAccountData.mock.calls.at(-1);
        expect(last?.[0]).toBe(USER_PACK_EVENT_TYPE);
        expect(Object.keys((last?.[1] as { images: object }).images)).toEqual(["sticker_1", "sticker_2"]);
        expect(store.mine().map((s) => s.description)).toEqual(["Gato", "Perro"]);
    });

    // After 30 s, what the server synced wins again (another device may have changed it).
    it("trusts the synced copy after a while", async () => {
        let t = 0;
        const { asClient } = fakeClient({ [USER_PACK_EVENT_TYPE]: { images: {} } });
        const store = new StickerStore(asClient, fetch, () => t);
        await store.add(GATO);
        expect(store.mine()).toHaveLength(1);
        t = 31_000;
        expect(store.mine()).toHaveLength(0);
    });

    it("removes a sticker", async () => {
        const { client, asClient } = fakeClient({
            [USER_PACK_EVENT_TYPE]: { images: { sticker_1: { url: "mxc://a/1" }, sticker_2: { url: "mxc://a/2" } } },
        });
        await new StickerStore(asClient).remove("sticker_1");
        expect(client.setAccountData).toHaveBeenCalledWith(USER_PACK_EVENT_TYPE, {
            images: { sticker_2: { url: "mxc://a/2" } },
        });
    });

    // A starter sticker is uploaded the first time it's sent, then its address is reused.
    it("uploads a starter sticker once", async () => {
        const { client, sync, asClient } = fakeClient();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["webp"]), { status: 200 }));
        const store = new StickerStore(asClient, fetchFn);
        const cat = store.starter("es").find((s) => s.id === "starter:cat")!;
        expect(await store.mxcUrlFor(cat)).toBe("mxc://artise.co/uploaded");
        expect(fetchFn).toHaveBeenCalledWith("media/artise/stickers/starter/cat.webp");
        expect(client.setAccountData).toHaveBeenCalledWith(UPLOADS_EVENT_TYPE, {
            "starter:cat": "mxc://artise.co/uploaded",
        });
        sync();
        expect(await new StickerStore(asClient, fetchFn).mxcUrlFor(cat)).toBe("mxc://artise.co/uploaded");
        expect(client.uploadContent).toHaveBeenCalledTimes(1);
    });

    // m.sticker to the chat; as a reply, or in a thread when the composer was.
    it("sends stickers, as replies and in threads", async () => {
        const { client, asClient } = fakeClient();
        const store = new StickerStore(asClient);
        await store.send("!r:x", GATO);
        expect(client.sendEvent).toHaveBeenLastCalledWith("!r:x", null, "m.sticker", {
            body: "Gato",
            url: "mxc://artise.co/gato",
            info: { w: 256, h: 256, mimetype: "image/webp", size: 100 },
        });
        await store.send("!r:x", GATO, { replyTo: "$q" });
        expect(client.sendEvent.mock.calls.at(-1)?.[3]).toMatchObject({
            "m.relates_to": { "m.in_reply_to": { event_id: "$q" } },
        });
        await store.send("!r:x", GATO, { threadRoot: "$root" });
        expect(client.sendEvent.mock.calls.at(-1)?.slice(0, 2)).toEqual(["!r:x", "$root"]);
        expect(client.sendEvent.mock.calls.at(-1)?.[3]).toMatchObject({
            "m.relates_to": {
                "rel_type": "m.thread",
                "event_id": "$root",
                "is_falling_back": true,
                "m.in_reply_to": { event_id: "$root" },
            },
        });
    });
});
