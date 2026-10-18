/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseSettingsView } from "./ArtiseSettingsView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { type ArtiseSettingsViewActions, type ArtiseSettingsViewSnapshot } from "./types";

type ArtiseSettingsProps = ArtiseSettingsViewSnapshot & ArtiseSettingsViewActions;

const ArtiseSettingsViewWrapperImpl = ({ open, ...rest }: ArtiseSettingsProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { open });
    return <ArtiseSettingsView vm={vm} />;
};
const ArtiseSettingsViewWrapper = withViewDocs(ArtiseSettingsViewWrapperImpl, ArtiseSettingsView);

const meta = {
    title: "Artise/ArtiseSettingsView",
    component: ArtiseSettingsViewWrapper,
    tags: ["autodocs"],
    args: {
        title: "Ayuda y cuenta",
        rows: [
            {
                id: "help",
                title: "Ayuda",
                description: "Guías y respuestas sobre Artise.",
                actionLabel: "Ayuda",
            },
            {
                id: "contact_admin",
                title: "Escribirle al administrador",
                description: "Para dudas sobre Prueba MAS.",
                actionLabel: "Escribirle al administrador",
            },
            {
                id: "security",
                title: "Seguridad",
                description: "La verificación en dos pasos y cómo entras a tu Artise ID.",
                actionLabel: "Administrar en Artise ID",
            },
            {
                id: "delete_account",
                title: "Eliminar cuenta",
                description: "Elimina tu cuenta en Prueba MAS y lo que hay en ella. No se puede deshacer.",
                actionLabel: "Eliminar cuenta",
                destructive: true,
            },
        ],
        open: fn(),
    },
} satisfies Meta<typeof ArtiseSettingsViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** mas-k8s: every row, since its workspace file has every link. */
export const Default: Story = {};

/** artise.co on 2026-10-18: no help page and no admin in its workspace file, so only two rows. */
export const ShortWorkspaceFile: Story = {
    args: {
        rows: [
            {
                id: "security",
                title: "Seguridad",
                description: "La verificación en dos pasos y cómo entras a tu Artise ID.",
                actionLabel: "Administrar en Artise ID",
            },
            {
                id: "delete_account",
                title: "Eliminar cuenta",
                description: "Elimina tu cuenta en Artise y lo que hay en ella. No se puede deshacer.",
                actionLabel: "Eliminar cuenta",
                destructive: true,
            },
        ],
    },
};
