/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { fn } from "storybook/test";
import { describe, it, expect } from "vitest";

import * as stories from "./ArtiseStickerPickerView.stories";

const { Default, Mine, MineEmpty, ConfirmRemove } = composeStories(stories);

describe("ArtiseStickerPickerView", () => {
    // The starter pack: each sticker named for screen readers, and the credit.
    it("shows the starter pack", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
        expect(screen.getByRole("tab", { name: "Paquete inicial" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("button", { name: "Gato" })).toBeVisible();
        expect(screen.getByText("Stickers iniciales: Fluent Emoji de Microsoft (licencia MIT)")).toBeVisible();
        expect(screen.queryByRole("button", { name: /Quitar/ })).toBeNull();
    });

    it("sends the sticker pressed and switches tabs", async () => {
        const send = fn();
        const setTab = fn();
        render(<Default send={send} setTab={setTab} />);
        await userEvent.click(screen.getByRole("button", { name: "Perro" }));
        expect(send).toHaveBeenCalledWith("starter:dog");
        await userEvent.click(screen.getByRole("tab", { name: "Míos" }));
        expect(setTab).toHaveBeenCalledWith("mine");
    });

    it("removes one of the person's own after asking", async () => {
        const remove = fn();
        render(<Mine remove={remove} />);
        await userEvent.click(screen.getByRole("button", { name: "Quitar: Luna feliz" }));
        expect(remove).toHaveBeenCalledWith("sticker_1");
    });

    it("asks before removing", async () => {
        const confirmRemoval = fn();
        render(<ConfirmRemove confirmRemoval={confirmRemoval} />);
        expect(screen.getByRole("alertdialog", { name: "¿Quitar este sticker?" })).toBeVisible();
        await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
        expect(confirmRemoval).toHaveBeenCalled();
    });

    it("says where saved stickers will show", () => {
        render(<MineEmpty />);
        expect(screen.getByText(/Aquí aparecen los stickers que guardes/)).toBeVisible();
    });
});
