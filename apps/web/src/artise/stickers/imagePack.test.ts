/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";

import {
    freeShortcode,
    packStickers,
    receivedSticker,
    type Sticker,
    stickerMessage,
    withSticker,
    withoutSticker,
} from "./imagePack";

const STICKER: Sticker = {
    id: "",
    description: "Gato",
    url: "mxc://artise.co/gato",
    starter: false,
    width: 512,
    height: 400,
    mimeType: "image/webp",
    size: 9000,
};

describe("image pack (MSC2545)", () => {
    // Stickers and images without a usage are stickers; emoji-only images and pictures that aren't mxc:// are not.
    it("reads the stickers in a pack", () => {
        const content = {
            images: {
                sticker_1: {
                    url: "mxc://a/1",
                    body: "Hola",
                    info: { w: 300, h: 200, mimetype: "image/png", size: 10 },
                },
                party: { url: "mxc://a/2", usage: ["emoticon"] },
                both: { url: "mxc://a/3", usage: ["emoticon", "sticker"] },
                broken: { url: "https://x/y.png" },
            },
        };
        expect(packStickers(content).map((s) => [s.id, s.description, s.width, s.mimeType])).toEqual([
            ["sticker_1", "Hola", 300, "image/png"],
            ["both", "both", 256, "image/webp"],
        ]);
        expect(packStickers(null)).toEqual([]);
    });

    // A new sticker gets the next free shortcode; another app's emojis and the pack's own name stay.
    it("adds and removes stickers, keeping the rest", () => {
        const content = { images: { party: { url: "mxc://a/2", usage: ["emoticon"] } }, pack: { display_name: "Mío" } };
        expect(freeShortcode(content)).toBe("sticker_1");
        const added = withSticker(content, "sticker_1", STICKER);
        expect(added).toEqual({
            images: {
                party: { url: "mxc://a/2", usage: ["emoticon"] },
                sticker_1: {
                    url: "mxc://artise.co/gato",
                    body: "Gato",
                    info: { w: 512, h: 400, mimetype: "image/webp", size: 9000 },
                    usage: ["sticker"],
                },
            },
            pack: { display_name: "Mío" },
        });
        expect(freeShortcode(added)).toBe("sticker_2");
        expect(withoutSticker(added, "sticker_1")).toEqual(content);
    });

    // A first sticker names the pack as the phones do.
    it("names a new pack", () => {
        expect(withSticker({}, "sticker_1", STICKER).pack).toEqual({ display_name: "My stickers", usage: ["sticker"] });
    });

    it("writes an m.sticker message", () => {
        expect(stickerMessage(STICKER, "mxc://artise.co/gato")).toEqual({
            body: "Gato",
            url: "mxc://artise.co/gato",
            info: { w: 512, h: 400, mimetype: "image/webp", size: 9000 },
        });
        expect(stickerMessage({ ...STICKER, size: 0 }, "mxc://x").info).toEqual({
            w: 512,
            h: 400,
            mimetype: "image/webp",
        });
    });

    // A received sticker can be saved when its picture is on a Matrix server.
    it("reads a received sticker", () => {
        expect(receivedSticker({ body: "Gato", url: "mxc://a/b", info: { w: 100, h: 90 } })).toMatchObject({
            description: "Gato",
            url: "mxc://a/b",
            width: 100,
            height: 90,
        });
        expect(receivedSticker({ body: "x", url: "https://evil/x.png" })).toBeNull();
        expect(receivedSticker({ url: "mxc://a/b" })?.description).toBe("Sticker");
    });
});
