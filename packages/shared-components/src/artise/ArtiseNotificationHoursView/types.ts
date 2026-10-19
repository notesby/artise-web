/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";

/** A day in Custom: whether it's on, and its hours as `HH:MM`. */
export interface ArtiseHoursDay {
    id: string;
    /** "Lunes". */
    label: string;
    on: boolean;
    start: string;
    end: string;
}

export interface ArtiseNotificationHoursViewSnapshot {
    title: string;
    description: string;
    enabled: boolean;
    /** "Días" and the three choices. */
    scheduleLabel: string;
    schedules: { id: string; label: string }[];
    schedule: string;
    /** Under the choice: what happens on days without hours. */
    footer?: string;
    /** "Horario", "Desde", "Hasta". */
    hoursLabel: string;
    fromLabel: string;
    untilLabel: string;
    /** The Every day / Monday to Friday hours, as `HH:MM`. */
    start: string;
    end: string;
    /** For Custom: every day of the week. */
    days?: ArtiseHoursDay[];
    mentionsLabel: string;
    mentions: boolean;
    /** Set when the browser won't keep the settings. */
    warning?: string;
}

export interface ArtiseNotificationHoursViewActions {
    setEnabled: (enabled: boolean) => void;
    setSchedule: (schedule: string) => void;
    /** `day` undefined is the Every day / Monday to Friday hours; `time` is `HH:MM`. */
    setTime: (day: string | undefined, isStart: boolean, time: string) => void;
    setDay: (day: string, on: boolean) => void;
    setMentions: (mentions: boolean) => void;
}

export type ArtiseNotificationHoursViewModel = ViewModel<
    ArtiseNotificationHoursViewSnapshot,
    ArtiseNotificationHoursViewActions
>;
