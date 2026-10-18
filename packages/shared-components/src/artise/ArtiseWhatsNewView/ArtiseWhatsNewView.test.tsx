/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, expect } from "vitest";

import * as stories from "./ArtiseWhatsNewView.stories";
import { ArtiseWhatsNewView } from "./ArtiseWhatsNewView";
import { MockViewModel } from "../../core/viewmodel/MockViewModel";
import { type ArtiseWhatsNewViewSnapshot } from "./types";

const { Default } = composeStories(stories);

const SNAPSHOT: ArtiseWhatsNewViewSnapshot = {
    visible: true,
    title: "Novedades",
    items: ["Uno", "Dos"],
    doneLabel: "Entendido",
};

describe("ArtiseWhatsNewView", () => {
    // The card with its heading, the release's lines and the button.
    it("renders the release's changes", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
        expect(screen.getByRole("region", { name: "Novedades" })).toBeVisible();
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    // "Entendido" tells the view model to hide it.
    it("dismisses", async () => {
        const dismiss = vi.fn();
        render(<ArtiseWhatsNewView vm={Object.assign(new MockViewModel(SNAPSHOT), { dismiss })} />);
        await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
        expect(dismiss).toHaveBeenCalled();
    });

    // Nothing new (or already dismissed): nothing drawn.
    it("draws nothing when it isn't visible", () => {
        const vm = Object.assign(new MockViewModel({ ...SNAPSHOT, visible: false }), { dismiss: vi.fn() });
        const { container } = render(<ArtiseWhatsNewView vm={vm} />);
        expect(container).toBeEmptyDOMElement();
    });
});
