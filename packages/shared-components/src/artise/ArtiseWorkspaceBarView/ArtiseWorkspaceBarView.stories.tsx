/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseWorkspaceBarView } from "./ArtiseWorkspaceBarView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { type ArtiseWorkspaceBarViewActions, type ArtiseWorkspaceBarViewSnapshot } from "./types";

type ArtiseWorkspaceBarProps = ArtiseWorkspaceBarViewSnapshot & ArtiseWorkspaceBarViewActions;

const ArtiseWorkspaceBarViewWrapperImpl = ({ switchTo, ...rest }: ArtiseWorkspaceBarProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { switchTo });
    return <ArtiseWorkspaceBarView vm={vm} />;
};
const ArtiseWorkspaceBarViewWrapper = withViewDocs(ArtiseWorkspaceBarViewWrapperImpl, ArtiseWorkspaceBarView);

const meta = {
    title: "Artise/ArtiseWorkspaceBarView",
    component: ArtiseWorkspaceBarViewWrapper,
    tags: ["autodocs"],
    args: {
        visible: true,
        current: { id: "mas-k8s.artise.co", name: "Prueba MAS", color: "#1F6FEB" },
        others: [{ id: "artise.co", name: "Artise" }],
        switchLabel: "Cambiar de espacio de trabajo (ahora: Prueba MAS)",
        menuTitle: "Tus espacios de trabajo",
        switchTo: fn(),
    },
} satisfies Meta<typeof ArtiseWorkspaceBarViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Someone in two workspaces: the name opens a menu with the other one. */
export const Default: Story = {};

/** Someone in one workspace (or before the list arrives): the name only, no menu. */
export const OneWorkspace: Story = {
    args: { others: [] },
};
