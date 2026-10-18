/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, afterEach, expect } from "vitest";

import * as stories from "./ArtiseSettingsView.stories";
import { ArtiseSettingsView } from "./ArtiseSettingsView";
import { MockViewModel } from "../../core/viewmodel/MockViewModel";
import { type ArtiseSettingsViewActions, type ArtiseSettingsViewSnapshot } from "./types";

const { Default, ShortWorkspaceFile } = composeStories(stories);

describe("ArtiseSettingsView", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders every row for a full workspace file", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
    });

    it("shows only the rows it is given (artise.co's short file)", () => {
        render(<ShortWorkspaceFile />);
        expect(screen.queryByText("Ayuda", { selector: "span" })).toBeNull();
        expect(screen.getByRole("button", { name: "Administrar en Artise ID" })).toBeVisible();
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("tells the view model which row was pressed", async () => {
        const user = userEvent.setup();
        const snapshot: ArtiseSettingsViewSnapshot = {
            title: "Ayuda y cuenta",
            rows: [
                { id: "help", title: "Ayuda", description: "Guías", actionLabel: "Abrir la ayuda" },
                {
                    id: "delete_account",
                    title: "Eliminar cuenta",
                    description: "No se puede deshacer.",
                    actionLabel: "Eliminar cuenta",
                    destructive: true,
                },
            ],
        };
        const actions: ArtiseSettingsViewActions = { open: vi.fn() };
        const vm = Object.assign(new MockViewModel(snapshot), actions);
        render(<ArtiseSettingsView vm={vm} />);

        await user.click(screen.getByRole("button", { name: "Eliminar cuenta" }));
        expect(actions.open).toHaveBeenCalledWith("delete_account");
        await user.click(screen.getByRole("button", { name: "Abrir la ayuda" }));
        expect(actions.open).toHaveBeenCalledWith("help");
    });

    it("names the section by its heading for screen readers", () => {
        render(<Default />);
        expect(screen.getByRole("region", { name: "Ayuda y cuenta" })).toBeVisible();
    });
});
