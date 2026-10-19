/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseNotificationHoursViewModel as ArtiseNotificationHoursViewModelInterface,
    type ArtiseNotificationHoursViewSnapshot,
} from "@element-hq/web-shared-components";

import { artiseT } from "../i18n/artiseT";
import {
    DAYS,
    type DayOfWeek,
    type HoursWindow,
    loadHours,
    type NotificationHoursSettings,
    type NotificationSchedule,
    saveHours,
    withDay,
    withSchedule,
    withTime,
} from "./notificationHours";

export interface NotificationHoursViewModelProps {
    /** The signed-in account: each account keeps its own hours. */
    userId: string;
    /** This browser's storage, or `null` when it's blocked. */
    storage: Pick<Storage, "getItem" | "setItem"> | null;
    /** The app's language, for the days' names. */
    language: string;
    /** True in the desktop app ("on this computer" instead of "in this browser"). */
    inDesktopApp: boolean;
}

const SCHEDULES: NotificationSchedule[] = ["EVERY_DAY", "WEEKDAYS", "CUSTOM"];

/** `HH:MM` from minutes after midnight. */
export function toTime(minute: number): string {
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Minutes after midnight from `HH:MM`, or `null` for anything else. */
export function fromTime(time: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function dayNames(language: string): string[] {
    // 19 Oct 2026 is a Monday.
    const format = new Intl.DateTimeFormat(language, { weekday: "long" });
    return DAYS.map((_, i) => {
        const name = format.format(new Date(2026, 9, 19 + i));
        return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
    });
}

/** "Horario de notificaciones" in Artise's settings tab: the phones' settings, kept in this browser. */
export class NotificationHoursViewModel
    extends BaseViewModel<ArtiseNotificationHoursViewSnapshot, NotificationHoursViewModelProps>
    implements ArtiseNotificationHoursViewModelInterface
{
    private settings: NotificationHoursSettings;
    private readonly names: string[];
    private kept = true;

    public constructor(props: NotificationHoursViewModelProps) {
        const settings = loadHours(props.userId, props.storage);
        super(props, NotificationHoursViewModel.snapshotOf(settings, dayNames(props.language), props, true));
        this.settings = settings;
        this.names = dayNames(props.language);
    }

    private static snapshotOf(
        settings: NotificationHoursSettings,
        names: string[],
        props: NotificationHoursViewModelProps,
        kept: boolean,
    ): ArtiseNotificationHoursViewSnapshot {
        const custom = settings.schedule === "CUSTOM";
        const footer =
            settings.schedule === "WEEKDAYS"
                ? artiseT("artise|hours|weekdays_footer")
                : custom
                  ? artiseT("artise|hours|custom_footer")
                  : undefined;
        return {
            title: artiseT("artise|hours|title"),
            description: artiseT(
                props.inDesktopApp ? "artise|hours|description_computer" : "artise|hours|description_browser",
            ),
            enabled: settings.enabled,
            scheduleLabel: artiseT("artise|hours|days"),
            schedules: [
                { id: "EVERY_DAY", label: artiseT("artise|hours|every_day") },
                { id: "WEEKDAYS", label: artiseT("artise|hours|weekdays") },
                { id: "CUSTOM", label: artiseT("artise|hours|custom") },
            ],
            schedule: settings.schedule,
            footer,
            hoursLabel: artiseT("artise|hours|hours"),
            fromLabel: artiseT("artise|hours|from"),
            untilLabel: artiseT("artise|hours|until"),
            start: toTime(settings.window.start),
            end: toTime(settings.window.end),
            days: custom
                ? DAYS.map((day, i) => {
                      const window: HoursWindow = settings.days[day] ?? settings.window;
                      return {
                          id: day,
                          label: names[i],
                          on: !!settings.days[day],
                          start: toTime(window.start),
                          end: toTime(window.end),
                      };
                  })
                : undefined,
            mentionsLabel: artiseT("artise|hours|mentions"),
            mentions: settings.mentions,
            warning: kept ? undefined : artiseT("artise|hours|not_kept"),
        };
    }

    private update(next: NotificationHoursSettings): void {
        this.settings = next;
        this.kept = saveHours(this.props.userId, next, this.props.storage);
        this.snapshot.set(NotificationHoursViewModel.snapshotOf(next, this.names, this.props, this.kept));
    }

    public setEnabled = (enabled: boolean): void => this.update({ ...this.settings, enabled });

    public setSchedule = (schedule: string): void => {
        if (!SCHEDULES.includes(schedule as NotificationSchedule)) return;
        this.update(withSchedule(this.settings, schedule as NotificationSchedule));
    };

    public setTime = (day: string | undefined, isStart: boolean, time: string): void => {
        const minute = fromTime(time);
        if (minute === null || (day !== undefined && !DAYS.includes(day as DayOfWeek))) return;
        this.update(withTime(this.settings, day as DayOfWeek | undefined, isStart, minute));
    };

    public setDay = (day: string, on: boolean): void => {
        if (!DAYS.includes(day as DayOfWeek)) return;
        this.update(withDay(this.settings, day as DayOfWeek, on));
    };

    public setMentions = (mentions: boolean): void => this.update({ ...this.settings, mentions });
}
