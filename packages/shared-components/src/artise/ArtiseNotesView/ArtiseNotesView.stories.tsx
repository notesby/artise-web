/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseNotesView } from "./ArtiseNotesView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { MOLE } from "../ArtiseNoteView/ArtiseNoteView.stories";
import { type ArtiseNotesViewActions, type ArtiseNotesViewSnapshot } from "./types";

type ArtiseNotesProps = ArtiseNotesViewSnapshot & ArtiseNotesViewActions;

const ArtiseNotesViewWrapperImpl = ({
    back,
    retry,
    chooseChat,
    select,
    toggleFolder,
    openLink,
    openEmbed,
    download,
    openFile,
    ...rest
}: ArtiseNotesProps): JSX.Element => {
    const vm = useMockedViewModel(rest, {
        back,
        retry,
        chooseChat,
        select,
        toggleFolder,
        openLink,
        openEmbed,
        download,
        openFile,
    });
    return <ArtiseNotesView vm={vm} />;
};
const ArtiseNotesViewWrapper = withViewDocs(ArtiseNotesViewWrapperImpl, ArtiseNotesView);

const meta = {
    title: "Artise/ArtiseNotesView",
    component: ArtiseNotesViewWrapper,
    tags: ["autodocs"],
    args: {
        title: "Notas",
        chatName: "Familia",
        state: "ready",
        items: [
            { path: "Recetas", name: "Recetas", depth: 0, kind: "folder", expanded: true },
            { path: "Recetas/Postres", name: "Postres", depth: 1, kind: "folder", expanded: false },
            { path: "Recetas/Mole.md", name: "Mole", depth: 1, kind: "note" },
            { path: "attachments", name: "attachments", depth: 0, kind: "folder", expanded: false },
            { path: "Súper.md", name: "Súper", depth: 0, kind: "note" },
        ],
        selectedPath: "Recetas/Mole.md",
        content: { kind: "note", path: "Recetas/Mole.md", title: "Mole", document: MOLE },
        privacyText:
            "Ari puede leer las notas de este chat, así que se guardan en el servidor de Artise, sin el cifrado de extremo a extremo de tus mensajes.",
        labels: {
            back: "Volver al chat",
            retry: "Reintentar",
            tree: "Archivos",
            task: "Hecho",
            download: "Descargar",
            open: "Abrir",
            chooseChat: "Elige un chat para ver sus notas.",
        },
        back: fn(),
        retry: fn(),
        chooseChat: fn(),
        select: fn(),
        toggleFolder: fn(),
        openLink: fn(),
        openEmbed: fn(),
        download: fn(),
        openFile: fn(),
    },
} satisfies Meta<typeof ArtiseNotesViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Familia's notes with "Mole" open. */
export const Default: Story = {};

/** A PDF picked in the list: open it in a new tab or download it. */
export const File: Story = {
    args: {
        selectedPath: "attachments/factura.pdf",
        content: {
            kind: "file",
            path: "attachments/factura.pdf",
            title: "factura.pdf",
            text: "Ábrelo en una pestaña nueva o descárgalo.",
            canOpen: true,
        },
    },
};

/** The list couldn't load. */
export const Error: Story = {
    args: { state: "error", errorText: "Esto necesita conexión. Inténtalo cuando tengas internet." },
};

/** Opened without a chat: the chats with notes. */
export const ChooseChat: Story = {
    args: {
        chatName: "",
        chats: [
            { id: "!familia:artise.co", name: "Familia" },
            { id: "!casa:artise.co", name: "Casa" },
        ],
    },
};
