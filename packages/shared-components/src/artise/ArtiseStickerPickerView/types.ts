/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";

export interface ArtiseStickerItem {
    id: string;
    /** Read aloud, and shown as its tooltip. */
    description: string;
    /** The picture's address (a thumbnail of the person's own, or the starter pack's in the app). */
    src: string;
}

export interface ArtiseStickerPickerViewSnapshot {
    /** "Míos" and "Paquete inicial". */
    tabs: { id: string; label: string }[];
    tab: string;
    stickers: ArtiseStickerItem[];
    /** Shown when the tab has no stickers. */
    emptyText?: string;
    /** The starter pack's credit, under its stickers. */
    credit?: string;
    /** While a sticker is being sent. */
    busy: boolean;
    /** Why the last action failed. */
    error?: string;
    /** Whether the stickers can be removed (the person's own). */
    removable: boolean;
    /** Asking before removing one of the person's stickers. */
    confirmRemove?: { id: string; title: string; message: string };
    labels: { remove: string; cancel: string };
}

export interface ArtiseStickerPickerViewActions {
    setTab: (tab: string) => void;
    send: (id: string) => void;
    /** Ask before removing one of the person's own stickers. */
    remove: (id: string) => void;
    confirmRemoval: () => void;
    cancelRemoval: () => void;
}

export type ArtiseStickerPickerViewModel = ViewModel<ArtiseStickerPickerViewSnapshot, ArtiseStickerPickerViewActions>;
