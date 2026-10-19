/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/*
 * A person's own sticker pack, kept in their account as an "image pack" (MSC2545, `im.ponies.user_emotes`): the
 * format the phones (Android ImagePack.kt) and FluffyChat, Cinny and Nheko read too. Everything Artise doesn't
 * use, like custom emojis added by another app, is kept as it is.
 */

export const USER_PACK_EVENT_TYPE = "im.ponies.user_emotes";

/** The pack's name when Artise creates it, as the phones name it. */
export const PACK_NAME = "My stickers";

const DEFAULT_SIDE = 256;

/** A sticker as the picker shows it and `m.sticker` sends it. */
export interface Sticker {
    /** The pack's shortcode (`sticker_1`), or `starter:<id>` for the starter pack. */
    id: string;
    /** Read aloud by screen readers and shown by apps that can't draw stickers. */
    description: string;
    /** `mxc://…` for the person's own; for a starter sticker, its picture in the app. */
    url: string;
    starter: boolean;
    width: number;
    height: number;
    mimeType: string;
    size: number;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The stickers in a pack's content; images marked only as emojis aren't stickers. */
export function packStickers(content: unknown): Sticker[] {
    const images = asObject(asObject(content).images);
    const stickers: Sticker[] = [];
    for (const [shortcode, value] of Object.entries(images)) {
        const image = asObject(value);
        if (typeof image.url !== "string" || !image.url.startsWith("mxc://")) continue;
        const usage = Array.isArray(image.usage) ? image.usage.filter((u): u is string => typeof u === "string") : null;
        if (usage && !usage.includes("sticker")) continue;
        const info = asObject(image.info);
        stickers.push({
            id: shortcode,
            description: typeof image.body === "string" ? image.body : shortcode,
            url: image.url,
            starter: false,
            width: asNumber(info.w, DEFAULT_SIDE),
            height: asNumber(info.h, DEFAULT_SIDE),
            mimeType: typeof info.mimetype === "string" ? info.mimetype : "image/webp",
            size: asNumber(info.size, 0),
        });
    }
    return stickers;
}

/** A short name that isn't taken yet: `sticker_1`, `sticker_2`… */
export function freeShortcode(content: unknown): string {
    const taken = new Set(Object.keys(asObject(asObject(content).images)));
    let n = 1;
    while (taken.has(`sticker_${n}`)) n++;
    return `sticker_${n}`;
}

/** The pack's content with a sticker added under `shortcode`; the pack gets a name if it has none. */
export function withSticker(content: unknown, shortcode: string, sticker: Sticker): Json {
    const root = asObject(content);
    const images = {
        ...asObject(root.images),
        [shortcode]: {
            url: sticker.url,
            body: sticker.description,
            info: { w: sticker.width, h: sticker.height, mimetype: sticker.mimeType, size: sticker.size },
            usage: ["sticker"],
        },
    };
    const pack = Object.keys(asObject(root.pack)).length ? root.pack : { display_name: PACK_NAME, usage: ["sticker"] };
    return { ...root, images, pack };
}

/** The pack's content without the image `shortcode`. */
export function withoutSticker(content: unknown, shortcode: string): Json {
    const root = asObject(content);
    const { [shortcode]: _removed, ...images } = asObject(root.images);
    return { ...root, images };
}

/** An `m.sticker` message's content (what Element and the phones show as a sticker). */
export function stickerMessage(sticker: Sticker, mxcUrl: string): Json {
    return {
        body: sticker.description,
        url: mxcUrl,
        info: {
            w: sticker.width,
            h: sticker.height,
            mimetype: sticker.mimeType,
            ...(sticker.size > 0 ? { size: sticker.size } : {}),
        },
    };
}

/** A received `m.sticker`'s content as a sticker to save, or `null` when it can't be saved (no `mxc://` picture). */
export function receivedSticker(content: unknown): Sticker | null {
    const raw = asObject(content);
    if (typeof raw.url !== "string" || !raw.url.startsWith("mxc://")) return null;
    const info = asObject(raw.info);
    return {
        id: "",
        description: typeof raw.body === "string" && raw.body ? raw.body : "Sticker",
        url: raw.url,
        starter: false,
        width: asNumber(info.w, DEFAULT_SIDE),
        height: asNumber(info.h, DEFAULT_SIDE),
        mimeType: typeof info.mimetype === "string" ? info.mimetype : "image/webp",
        size: asNumber(info.size, 0),
    };
}
