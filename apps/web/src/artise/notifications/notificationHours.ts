/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { type IActionsObject } from "matrix-js-sdk/src/pushprocessor";

import { automationLevel } from "./automationLevel";

/*
 * Notification hours: the same rules as the phones (Android artise/quiet NotificationHoursSettings, iOS
 * ArtiseCore/NotificationHours.swift), so the web sounds at the same moments.
 */

export type NotificationSchedule = "EVERY_DAY" | "WEEKDAYS" | "CUSTOM";

/** Monday first, as the phones' settings show them; `Date.getDay()` numbers them 1–6 and Sunday 0. */
export const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayOfWeek = (typeof DAYS)[number];

export const MINUTES_PER_DAY = 24 * 60;

/** From `start` to `end`, minutes after midnight. An earlier end goes past midnight; the same start and end is the whole day. */
export interface HoursWindow {
    start: number;
    end: number;
}

export interface NotificationHoursSettings {
    /** Off means notifications always sound. */
    enabled: boolean;
    schedule: NotificationSchedule;
    /** The hours for Every day and Monday to Friday. */
    window: HoursWindow;
    /** For Custom; a missing day is off, so it has no sound all day. */
    days: Partial<Record<DayOfWeek, HoursWindow>>;
    /** Mentions and replies sound anytime. */
    mentions: boolean;
}

/** First turned on: every day, 07:00 to 22:00, mentions sound (the phones' default). */
export const DEFAULT_HOURS: NotificationHoursSettings = {
    enabled: false,
    schedule: "EVERY_DAY",
    window: { start: 7 * 60, end: 22 * 60 },
    days: {},
    mentions: true,
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;

export function windowLength(window: HoursWindow): number {
    const length = mod(window.end - window.start, MINUTES_PER_DAY);
    return length === 0 ? MINUTES_PER_DAY : length;
}

/** Whether `minute` falls in these hours on the day they start (`daysLater` 0) or the day after (1). */
function contains(window: HoursWindow, minute: number, daysLater: number): boolean {
    const offset = minute + daysLater * MINUTES_PER_DAY - window.start;
    return offset >= 0 && offset < windowLength(window);
}

/** The hours that start on `day`, or `undefined` when that day has none. */
export function windowFor(settings: NotificationHoursSettings, day: DayOfWeek): HoursWindow | undefined {
    switch (settings.schedule) {
        case "EVERY_DAY":
            return settings.window;
        case "WEEKDAYS":
            return day === "SATURDAY" || day === "SUNDAY" ? undefined : settings.window;
        case "CUSTOM":
            return settings.days[day];
    }
}

function dayBefore(day: DayOfWeek): DayOfWeek {
    return DAYS[mod(DAYS.indexOf(day) - 1, 7)];
}

/** Whether a notification may sound on `day` at `minute` after midnight: today's hours, or yesterday's past midnight. */
export function soundsAt(
    settings: NotificationHoursSettings,
    day: DayOfWeek,
    minute: number,
    isMention: boolean,
): boolean {
    if (!settings.enabled || (isMention && settings.mentions)) return true;
    const today = windowFor(settings, day);
    const yesterday = windowFor(settings, dayBefore(day));
    return (!!today && contains(today, minute, 0)) || (!!yesterday && contains(yesterday, minute, 1));
}

/** The day and minute of a moment, in this computer's time zone. */
export function dayAndMinute(at: Date): { day: DayOfWeek; minute: number } {
    return { day: DAYS[mod(at.getDay() - 1, 7)], minute: at.getHours() * 60 + at.getMinutes() };
}

/** Custom starts from the hours already shown: every day from Every day, Monday to Friday from Monday to Friday. */
export function withSchedule(
    settings: NotificationHoursSettings,
    next: NotificationSchedule,
): NotificationHoursSettings {
    if (next === settings.schedule) return settings;
    if (next !== "CUSTOM") return { ...settings, schedule: next };
    const days: NotificationHoursSettings["days"] = {};
    for (const day of DAYS) {
        const window = windowFor(settings, day);
        if (window) days[day] = window;
    }
    return { ...settings, schedule: next, days };
}

/** A day switched on gets the Every day / Monday to Friday hours; switched off, it has no sound all day. */
export function withDay(settings: NotificationHoursSettings, day: DayOfWeek, on: boolean): NotificationHoursSettings {
    const days = { ...settings.days };
    if (on) days[day] = settings.window;
    else delete days[day];
    return { ...settings, days };
}

/** `day` undefined changes the Every day / Monday to Friday hours. */
export function withTime(
    settings: NotificationHoursSettings,
    day: DayOfWeek | undefined,
    isStart: boolean,
    minute: number,
): NotificationHoursSettings {
    const set = (window: HoursWindow): HoursWindow =>
        isStart ? { ...window, start: minute } : { ...window, end: minute };
    if (!day) return { ...settings, window: set(settings.window) };
    const current = settings.days[day];
    if (!current) return settings;
    return { ...settings, days: { ...settings.days, [day]: set(current) } };
}

/** Where the browser keeps each account's hours (by Matrix ID), in Android's `HoursDto` shape. */
export const HOURS_STORAGE_KEY = "artise.notificationHours";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function isWindow(value: unknown): value is HoursWindow {
    const w = value as HoursWindow;
    return (
        typeof value === "object" &&
        value !== null &&
        Number.isInteger(w.start) &&
        Number.isInteger(w.end) &&
        w.start >= 0 &&
        w.start < MINUTES_PER_DAY &&
        w.end >= 0 &&
        w.end < MINUTES_PER_DAY
    );
}

/** Reads one saved entry; anything unreadable is the default, so a bad value never silences everything. */
function parse(value: unknown): NotificationHoursSettings {
    if (typeof value !== "object" || value === null) return DEFAULT_HOURS;
    const raw = value as Record<string, unknown>;
    const schedule = raw.schedule === "WEEKDAYS" || raw.schedule === "CUSTOM" ? raw.schedule : "EVERY_DAY";
    const days: NotificationHoursSettings["days"] = {};
    if (typeof raw.days === "object" && raw.days !== null) {
        for (const day of DAYS) {
            const window = (raw.days as Record<string, unknown>)[day];
            if (isWindow(window)) days[day] = { start: window.start, end: window.end };
        }
    }
    return {
        enabled: raw.enabled === true,
        schedule,
        window: isWindow(raw.window) ? { start: raw.window.start, end: raw.window.end } : DEFAULT_HOURS.window,
        days,
        mentions: raw.mentions !== false,
    };
}

function readAll(storage: Storage | null): Record<string, unknown> {
    try {
        const saved = storage?.getItem(HOURS_STORAGE_KEY);
        const parsed: unknown = saved ? JSON.parse(saved) : {};
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

/** This account's hours in this browser; the default (off) when there are none or storage is blocked. */
export function loadHours(userId: string, storage: Storage | null): NotificationHoursSettings {
    return parse(readAll(storage)[userId]);
}

/** Saves this account's hours in this browser. Returns false when the browser won't keep them. */
export function saveHours(userId: string, settings: NotificationHoursSettings, storage: Storage | null): boolean {
    if (!storage) return false;
    try {
        storage.setItem(HOURS_STORAGE_KEY, JSON.stringify({ ...readAll(storage), [userId]: settings }));
        return true;
    } catch {
        return false;
    }
}

/**
 * The push actions with the sound taken away outside the notification hours: the notification still shows, it
 * just doesn't sound. A mention or reply (a highlight) sounds when the person allows it, and Ari's important and
 * critical posts always sound, as the phones' Reminders channel does.
 */
export function withNotificationHours(
    event: MatrixEvent,
    actions: IActionsObject | null,
    settings: NotificationHoursSettings,
    now: Date = new Date(),
): IActionsObject | null {
    if (!actions?.tweaks.sound || !settings.enabled) return actions;
    const level = automationLevel(event);
    if (level === "important" || level === "critical") return actions;
    const { day, minute } = dayAndMinute(now);
    if (soundsAt(settings, day, minute, !!actions.tweaks.highlight)) return actions;
    const { sound: _sound, ...tweaks } = actions.tweaks;
    return { ...actions, tweaks };
}
