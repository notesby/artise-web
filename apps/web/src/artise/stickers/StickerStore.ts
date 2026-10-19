/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type AccountDataEvents, type MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    freeShortcode,
    packStickers,
    type Sticker,
    stickerMessage,
    USER_PACK_EVENT_TYPE,
    withSticker,
    withoutSticker,
} from "./imagePack";
import starterPack from "./starterPack.json";

/** Where starter stickers this account already uploaded are remembered, so they upload once (as on the phones). */
export const UPLOADS_EVENT_TYPE = "co.artise.sticker_uploads";

/** The starter pack's pictures, served with the app (`res/media`). */
export const STARTER_FOLDER = "media/artise/stickers/starter";

/** For how long a write wins over the not-yet-synced copy (Android's RecentAccountData). */
const RECENT_MS = 30_000;

type Json = Record<string, unknown>;

/**
 * The person's own stickers (kept in their account, on all their devices) and the starter pack, as the phones
 * keep them (Android `DefaultStickerRepository`).
 */
export class StickerStore {
    /** What this tab wrote last to each type, and when: the client's copy only changes at the next sync. */
    private recent = new Map<string, { content: Json; at: number }>();
    /** Pack changes happen one at a time, so two stickers saved together both stay. */
    private queue: Promise<unknown> = Promise.resolve();

    public constructor(
        private readonly client: MatrixClient,
        private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
        private readonly now: () => number = Date.now,
    ) {}

    private read(type: string): Json | null {
        const stored =
            (this.client.getAccountData(type as keyof AccountDataEvents)?.getContent() as Json | undefined) ?? null;
        const write = this.recent.get(type);
        if (!write) return stored;
        const fresh = this.now() - write.at <= RECENT_MS;
        if (!fresh || JSON.stringify(stored) === JSON.stringify(write.content)) {
            this.recent.delete(type);
            return stored;
        }
        return write.content;
    }

    private async write(type: string, content: Json): Promise<void> {
        // The SDK's types list only Matrix's own account data; these are MSC2545's and Artise's.
        await this.client.setAccountData(type as keyof AccountDataEvents, content as never);
        this.recent.set(type, { content, at: this.now() });
    }

    private locked<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    /** The person's own stickers, newest last. */
    public mine(): Sticker[] {
        return packStickers(this.read(USER_PACK_EVENT_TYPE));
    }

    /** The starter pack (Microsoft's Fluent Emoji, MIT License), described in Spanish or English as on Android. */
    public starter(language: string): Sticker[] {
        const spanish = language.split("-")[0] === "es";
        return starterPack.stickers.map((entry) => ({
            id: `starter:${entry.id}`,
            description: spanish ? entry.es : entry.en,
            url: `${STARTER_FOLDER}/${entry.id}.webp`,
            starter: true,
            width: entry.w,
            height: entry.h,
            mimeType: "image/webp",
            size: entry.size,
        }));
    }

    /** Adds a sticker whose picture is on the server already (one someone sent) to the person's own. */
    public add(sticker: Sticker): Promise<Sticker> {
        return this.locked(async () => {
            const content = this.read(USER_PACK_EVENT_TYPE);
            const shortcode = freeShortcode(content);
            await this.write(USER_PACK_EVENT_TYPE, withSticker(content, shortcode, sticker));
            return { ...sticker, id: shortcode };
        });
    }

    /** Removes one of the person's own stickers (messages already sent keep it). */
    public remove(id: string): Promise<void> {
        return this.locked(async () => {
            await this.write(USER_PACK_EVENT_TYPE, withoutSticker(this.read(USER_PACK_EVENT_TYPE), id));
        });
    }

    /** The sticker's picture on the server; a starter sticker is uploaded the first time, then remembered. */
    public mxcUrlFor(sticker: Sticker): Promise<string> {
        if (!sticker.starter) return Promise.resolve(sticker.url);
        return this.locked(async () => {
            const uploads = this.read(UPLOADS_EVENT_TYPE) ?? {};
            const known = uploads[sticker.id];
            if (typeof known === "string" && known.startsWith("mxc://")) return known;
            const response = await this.fetchFn(sticker.url);
            if (!response.ok) throw new Error(`Artise: starter sticker ${sticker.id} answered ${response.status}`);
            const blob = new Blob([await response.blob()], { type: sticker.mimeType });
            const { content_uri: url } = await this.client.uploadContent(blob, {
                type: sticker.mimeType,
                includeFilename: false,
            });
            await this.write(UPLOADS_EVENT_TYPE, { ...uploads, [sticker.id]: url });
            return url;
        });
    }

    /**
     * Sends a sticker as an `m.sticker` message (encrypted when the chat is), as a reply or in a thread when the
     * composer was.
     */
    public async send(
        roomId: string,
        sticker: Sticker,
        options: { replyTo?: string; threadRoot?: string } = {},
    ): Promise<void> {
        const url = await this.mxcUrlFor(sticker);
        const content: Json = stickerMessage(sticker, url);
        const { replyTo, threadRoot } = options;
        if (threadRoot) {
            content["m.relates_to"] = {
                "rel_type": "m.thread",
                "event_id": threadRoot,
                "is_falling_back": !replyTo,
                "m.in_reply_to": { event_id: replyTo ?? threadRoot },
            };
        } else if (replyTo) {
            content["m.relates_to"] = { "m.in_reply_to": { event_id: replyTo } };
        }
        // The SDK types m.sticker's content more narrowly than the spec's (no thread relation): built above as the spec says.
        await this.client.sendEvent(roomId, threadRoot ?? null, "m.sticker" as never, content as never);
    }
}
