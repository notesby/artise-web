/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, afterEach, expect } from "vitest";

import * as stories from "./ArtiseWorkspaceBarView.stories";
import { ArtiseWorkspaceBarView } from "./ArtiseWorkspaceBarView";
import { MockViewModel } from "../../core/viewmodel/MockViewModel";
import { type ArtiseWorkspaceBarViewActions, type ArtiseWorkspaceBarViewSnapshot } from "./types";

const { Default, OneWorkspace } = composeStories(stories);

const SNAPSHOT: ArtiseWorkspaceBarViewSnapshot = {
    visible: true,
    current: { id: "mas-k8s.artise.co", name: "Prueba MAS" },
    others: [
        { id: "artise.co", name: "Artise", logo: "https://artise.co/logo.png" },
        { id: "familia.example", name: "Familia", color: "#C2410C" },
    ],
    switchLabel: "Cambiar de espacio de trabajo (ahora: Prueba MAS)",
    menuTitle: "Tus espacios de trabajo",
};

describe("ArtiseWorkspaceBarView", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    // Two workspaces: name, letter and a menu button.
    it("renders the workspace's name with a menu", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
    });

    // One workspace: the name is shown, but there is nothing to open.
    it("shows only the name when there's no other workspace", () => {
        render(<OneWorkspace />);
        expect(screen.getByText("Prueba MAS")).toBeVisible();
        expect(screen.queryByRole("button")).toBeNull();
    });

    // Picking a workspace in the menu tells the view model which one.
    it("lists the other workspaces and tells the view model which was picked", async () => {
        const user = userEvent.setup();
        const actions: ArtiseWorkspaceBarViewActions = { switchTo: vi.fn() };
        const vm = Object.assign(new MockViewModel(SNAPSHOT), actions);
        render(<ArtiseWorkspaceBarView vm={vm} />);

        await user.click(screen.getByRole("button", { name: "Cambiar de espacio de trabajo (ahora: Prueba MAS)" }));
        expect(screen.getByRole("menuitem", { name: "Artise" })).toBeVisible();
        await user.click(screen.getByRole("menuitem", { name: "Familia" }));
        expect(actions.switchTo).toHaveBeenCalledWith("familia.example");
    });

    // Outside an Artise workspace and in the desktop app, nothing is drawn.
    it("draws nothing when it isn't visible", () => {
        const vm = Object.assign(new MockViewModel({ ...SNAPSHOT, visible: false }), { switchTo: vi.fn() });
        const { container } = render(<ArtiseWorkspaceBarView vm={vm} />);
        expect(container).toBeEmptyDOMElement();
    });
});
