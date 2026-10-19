/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseStickerPickerView } from "./ArtiseStickerPickerView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { type ArtiseStickerPickerViewActions, type ArtiseStickerPickerViewSnapshot } from "./types";

type Props = ArtiseStickerPickerViewSnapshot & ArtiseStickerPickerViewActions;

const WrapperImpl = ({ setTab, send, remove, confirmRemoval, cancelRemoval, ...rest }: Props): JSX.Element => {
    const vm = useMockedViewModel(rest, { setTab, send, remove, confirmRemoval, cancelRemoval });
    return <ArtiseStickerPickerView vm={vm} />;
};
const Wrapper = withViewDocs(WrapperImpl, ArtiseStickerPickerView);

/** A sticker drawn as a coloured square, so stories don't depend on files. */
const square = (color: string): string =>
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="${color}"/></svg>`)}`;

const meta = {
    title: "Artise/ArtiseStickerPickerView",
    component: Wrapper,
    tags: ["autodocs"],
    args: {
        tabs: [
            { id: "mine", label: "Míos" },
            { id: "starter", label: "Paquete inicial" },
        ],
        tab: "starter",
        stickers: [
            { id: "starter:cat", description: "Gato", src: square("#f59e0b") },
            { id: "starter:dog", description: "Perro", src: square("#10b981") },
            { id: "starter:fire", description: "Fuego", src: square("#ef4444") },
        ],
        credit: "Stickers iniciales: Fluent Emoji de Microsoft (licencia MIT)",
        busy: false,
        removable: false,
        labels: { remove: "Quitar", cancel: "Cancelar" },
        setTab: fn(),
        send: fn(),
        remove: fn(),
        confirmRemoval: fn(),
        cancelRemoval: fn(),
    },
} satisfies Meta<typeof Wrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The starter pack. */
export const Default: Story = {};

/** The person's own, which can be removed. */
export const Mine: Story = {
    args: {
        tab: "mine",
        credit: undefined,
        removable: true,
        stickers: [{ id: "sticker_1", description: "Luna feliz", src: square("#6366f1") }],
    },
};

/** No stickers of their own yet. */
export const MineEmpty: Story = {
    args: {
        tab: "mine",
        credit: undefined,
        stickers: [],
        emptyText:
            "Aquí aparecen los stickers que guardes de los chats. Se guardan en tu cuenta, en todos tus dispositivos.",
    },
};

/** Asking before removing one. */
export const ConfirmRemove: Story = {
    args: {
        tab: "mine",
        removable: true,
        stickers: [{ id: "sticker_1", description: "Luna feliz", src: square("#6366f1") }],
        confirmRemove: {
            id: "sticker_1",
            title: "¿Quitar este sticker?",
            message: "Se quita de tus stickers en todos tus dispositivos. Los mensajes ya enviados lo conservan.",
        },
    },
};
