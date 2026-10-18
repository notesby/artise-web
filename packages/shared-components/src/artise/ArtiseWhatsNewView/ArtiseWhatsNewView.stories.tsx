/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseWhatsNewView } from "./ArtiseWhatsNewView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { type ArtiseWhatsNewViewActions, type ArtiseWhatsNewViewSnapshot } from "./types";

type ArtiseWhatsNewProps = ArtiseWhatsNewViewSnapshot & ArtiseWhatsNewViewActions;

const ArtiseWhatsNewViewWrapperImpl = ({ dismiss, ...rest }: ArtiseWhatsNewProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { dismiss });
    return <ArtiseWhatsNewView vm={vm} />;
};
const ArtiseWhatsNewViewWrapper = withViewDocs(ArtiseWhatsNewViewWrapperImpl, ArtiseWhatsNewView);

const meta = {
    title: "Artise/ArtiseWhatsNewView",
    component: ArtiseWhatsNewViewWrapper,
    tags: ["autodocs"],
    args: {
        visible: true,
        title: "Novedades",
        items: [
            "Ari aparece fijo arriba en tus chats, y en Ajustes tienes Ayuda y cuenta.",
            "El nombre de tu espacio de trabajo está arriba de tus chats: ábrelo para ir a tus otros espacios.",
            "Los mensajes importantes de Ari siempre te avisan, aunque el chat esté silenciado.",
        ],
        doneLabel: "Entendido",
        dismiss: fn(),
    },
} satisfies Meta<typeof ArtiseWhatsNewViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** After an update: this release's changes. */
export const Default: Story = {};
