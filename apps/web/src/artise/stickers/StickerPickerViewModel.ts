/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseStickerPickerViewModel as ArtiseStickerPickerViewModelInterface,
    type ArtiseStickerPickerViewSnapshot,
} from "@element-hq/web-shared-components";
import { ClientEvent, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { artiseT } from "../i18n/artiseT";
import { type Sticker, USER_PACK_EVENT_TYPE } from "./imagePack";
import { type StickerStore } from "./StickerStore";

export interface StickerPickerViewModelProps {
    client: MatrixClient;
    store: StickerStore;
    /** The app's language, for the starter pack's names. */
    language: string;
    roomId: string;
    /** The composer was replying to this event. */
    replyTo?: string;
    /** The composer was in this thread. */
    threadRoot?: string;
    /** A thumbnail address for a person's own sticker (`mxc://…`). */
    thumbnail: (mxcUrl: string) => string;
    /** A sticker was sent: close the picker. */
    onSent: () => void;
}

type Tab = "mine" | "starter";

/** The sticker picker: the person's own stickers and the starter pack; pressing one sends it to the chat. */
export class StickerPickerViewModel
    extends BaseViewModel<ArtiseStickerPickerViewSnapshot, StickerPickerViewModelProps>
    implements ArtiseStickerPickerViewModelInterface
{
    private tab: Tab;
    private shown: Sticker[] = [];

    public constructor(props: StickerPickerViewModelProps) {
        super(props, {
            tabs: [
                { id: "mine", label: artiseT("artise|stickers|mine") },
                { id: "starter", label: artiseT("artise|stickers|starter") },
            ],
            tab: "starter",
            stickers: [],
            busy: false,
            removable: false,
            labels: { remove: artiseT("artise|stickers|remove"), cancel: artiseT("artise|notes|cancel") },
        });
        // Opens on the person's own when they have some, as the phones do.
        this.tab = props.store.mine().length ? "mine" : "starter";
        this.show();
        this.disposables.trackListener(props.client, ClientEvent.AccountData, this.onAccountData as () => void);
    }

    /** The pack changed on another device: show it. */
    private readonly onAccountData = (event: MatrixEvent): void => {
        if (event.getType() === USER_PACK_EVENT_TYPE && this.tab === "mine") this.show();
    };

    private show(): void {
        const mine = this.tab === "mine";
        this.shown = mine ? this.props.store.mine() : this.props.store.starter(this.props.language);
        this.snapshot.merge({
            tab: this.tab,
            stickers: this.shown.map((sticker) => ({
                id: sticker.id,
                description: sticker.description,
                src: sticker.starter ? sticker.url : this.props.thumbnail(sticker.url),
            })),
            emptyText: mine ? artiseT("artise|stickers|empty") : undefined,
            credit: mine ? undefined : artiseT("artise|stickers|credit"),
            removable: mine,
            confirmRemove: undefined,
        });
    }

    public setTab = (tab: string): void => {
        if (tab !== "mine" && tab !== "starter") return;
        this.tab = tab;
        this.snapshot.merge({ error: undefined });
        this.show();
    };

    public send = (id: string): void => {
        const sticker = this.shown.find((s) => s.id === id);
        if (!sticker || this.snapshot.current.busy) return;
        this.snapshot.merge({ busy: true, error: undefined });
        const { store, roomId, replyTo, threadRoot } = this.props;
        void store
            .send(roomId, sticker, { replyTo, threadRoot })
            .then(() => {
                if (!this.isDisposed) this.props.onSent();
            })
            .catch((e) => {
                logger.warn("Artise: couldn't send a sticker", e);
                if (!this.isDisposed)
                    this.snapshot.merge({ busy: false, error: artiseT("artise|stickers|send_failed") });
            });
    };

    public remove = (id: string): void => {
        if (this.tab !== "mine") return;
        this.snapshot.merge({
            confirmRemove: {
                id,
                title: artiseT("artise|stickers|remove_title"),
                message: artiseT("artise|stickers|remove_message"),
            },
        });
    };

    public cancelRemoval = (): void => this.snapshot.merge({ confirmRemove: undefined });

    public confirmRemoval = (): void => {
        const pending = this.snapshot.current.confirmRemove;
        if (!pending) return;
        this.snapshot.merge({ confirmRemove: undefined, error: undefined });
        void this.props.store
            .remove(pending.id)
            .then(() => {
                if (!this.isDisposed) this.show();
            })
            .catch((e) => {
                logger.warn("Artise: couldn't remove a sticker", e);
                if (!this.isDisposed) this.snapshot.merge({ error: artiseT("artise|stickers|remove_failed") });
            });
    };
}
