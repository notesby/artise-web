/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { fireEvent, render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { fn } from "storybook/test";
import { describe, it, expect } from "vitest";

import * as stories from "./ArtiseNotificationHoursView.stories";

const { Default, Off, Custom } = composeStories(stories);

describe("ArtiseNotificationHoursView", () => {
    // On: the days, the hours and mentions.
    it("shows the hours", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
        expect(screen.getByRole("radio", { name: "De lunes a viernes" })).toBeChecked();
        expect(screen.getByLabelText("Desde")).toHaveValue("09:00");
        expect(screen.getByText("El sábado y el domingo, las notificaciones llegan sin sonido.")).toBeVisible();
    });

    // Off: only the switch.
    it("shows only the switch when off", async () => {
        const setEnabled = fn();
        render(<Off setEnabled={setEnabled} />);
        expect(screen.queryByRole("radio")).toBeNull();
        await userEvent.click(screen.getByRole("switch", { name: "Horario de notificaciones" }));
        expect(setEnabled).toHaveBeenCalledWith(true);
    });

    it("changes the days, the hours and mentions", async () => {
        const setSchedule = fn();
        const setTime = fn();
        const setMentions = fn();
        render(<Default setSchedule={setSchedule} setTime={setTime} setMentions={setMentions} />);
        await userEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
        expect(setSchedule).toHaveBeenCalledWith("CUSTOM");
        // Time fields are set whole, as the browser's time picker does.
        fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "20:30" } });
        expect(setTime).toHaveBeenLastCalledWith(undefined, false, "20:30");
        await userEvent.click(screen.getByRole("switch", { name: "Las menciones y respuestas siempre suenan" }));
        expect(setMentions).toHaveBeenCalledWith(false);
    });

    // Custom: each day switches on and off; a day that's off can't have its hours changed.
    it("switches days in Custom", async () => {
        const setDay = fn();
        render(<Custom setDay={setDay} />);
        expect(screen.getByLabelText("Sábado: Desde")).toBeDisabled();
        await userEvent.click(screen.getByRole("checkbox", { name: "Sábado" }));
        expect(setDay).toHaveBeenCalledWith("SATURDAY", true);
    });
});
