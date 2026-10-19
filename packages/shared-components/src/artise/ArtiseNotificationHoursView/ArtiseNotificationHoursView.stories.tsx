/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseNotificationHoursView } from "./ArtiseNotificationHoursView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { type ArtiseNotificationHoursViewActions, type ArtiseNotificationHoursViewSnapshot } from "./types";

type Props = ArtiseNotificationHoursViewSnapshot & ArtiseNotificationHoursViewActions;

const WrapperImpl = ({ setEnabled, setSchedule, setTime, setDay, setMentions, ...rest }: Props): JSX.Element => {
    const vm = useMockedViewModel(rest, { setEnabled, setSchedule, setTime, setDay, setMentions });
    return <ArtiseNotificationHoursView vm={vm} />;
};
const Wrapper = withViewDocs(WrapperImpl, ArtiseNotificationHoursView);

const LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const IDS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const meta = {
    title: "Artise/ArtiseNotificationHoursView",
    component: Wrapper,
    tags: ["autodocs"],
    args: {
        title: "Horario de notificaciones",
        description:
            "Fuera de este horario, las notificaciones de este espacio de trabajo llegan sin sonido en este navegador. Los recordatorios de Ari siempre suenan.",
        enabled: true,
        scheduleLabel: "Días",
        schedules: [
            { id: "EVERY_DAY", label: "Todos los días" },
            { id: "WEEKDAYS", label: "De lunes a viernes" },
            { id: "CUSTOM", label: "Personalizado" },
        ],
        schedule: "WEEKDAYS",
        footer: "El sábado y el domingo, las notificaciones llegan sin sonido.",
        hoursLabel: "Horario",
        fromLabel: "Desde",
        untilLabel: "Hasta",
        start: "09:00",
        end: "18:00",
        mentionsLabel: "Las menciones y respuestas siempre suenan",
        mentions: true,
        setEnabled: fn(),
        setSchedule: fn(),
        setTime: fn(),
        setDay: fn(),
        setMentions: fn(),
    },
} satisfies Meta<typeof Wrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Monday to Friday, 09:00 to 18:00. */
export const Default: Story = {};

/** Off: notifications always sound. */
export const Off: Story = { args: { enabled: false } };

/** Custom: each day on or off, with its own hours. */
export const Custom: Story = {
    args: {
        schedule: "CUSTOM",
        footer: "En un día apagado, las notificaciones llegan sin sonido. Si «Hasta» es antes que «Desde», el horario pasa de la medianoche.",
        days: IDS.map((id, i) => ({ id, label: LABELS[i], on: i < 5, start: "09:00", end: "18:00" })),
    },
};
