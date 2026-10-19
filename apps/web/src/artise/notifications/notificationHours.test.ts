/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";

import {
    DAYS,
    DEFAULT_HOURS,
    HOURS_STORAGE_KEY,
    loadHours,
    type NotificationHoursSettings,
    saveHours,
    soundsAt,
    dayAndMinute,
    windowLength,
    withDay,
    withNotificationHours,
    withSchedule,
    withTime,
} from "./notificationHours";

/** The same cases as Android's NotificationHoursTest and iOS's NotificationHoursTests. */
describe("notification hours (the phones' cases)", () => {
    const day: NotificationHoursSettings = { ...DEFAULT_HOURS, enabled: true, window: { start: 7 * 60, end: 22 * 60 } };

    // Friday 16 Oct 2026; Saturday 17, Sunday 18, Monday 19 (local time).
    const sounds = (
        settings: NotificationHoursSettings,
        date: number,
        hour: number,
        minute = 0,
        isMention = false,
    ): boolean => {
        const at = dayAndMinute(new Date(2026, 9, date, hour, minute));
        return soundsAt(settings, at.day, at.minute, isMention);
    };

    // Every day 07:00–22:00 sounds from 07:00 up to 21:59, weekend included; off always sounds.
    it("every day", () => {
        expect(sounds(day, 16, 7)).toBe(true);
        expect(sounds(day, 16, 21, 59)).toBe(true);
        expect(sounds(day, 16, 22)).toBe(false);
        expect(sounds(day, 16, 6, 59)).toBe(false);
        expect(sounds(day, 18, 12)).toBe(true);
        expect(sounds({ ...day, enabled: false }, 16, 23)).toBe(true);
    });

    // Monday to Friday 09:00–18:00: Saturday and Sunday have no sound all day.
    it("monday to friday", () => {
        const weekdays = { ...day, schedule: "WEEKDAYS" as const, window: { start: 9 * 60, end: 18 * 60 } };
        expect(sounds(weekdays, 16, 12)).toBe(true);
        expect(sounds(weekdays, 19, 9)).toBe(true);
        expect(sounds(weekdays, 17, 12)).toBe(false);
        expect(sounds(weekdays, 18, 12)).toBe(false);
    });

    // Custom: a day that's on uses its own hours; a day that's off has no sound all day.
    it("custom with a day off", () => {
        const custom = { ...day, schedule: "CUSTOM" as const, days: { SUNDAY: { start: 10 * 60, end: 12 * 60 } } };
        expect(sounds(custom, 18, 10)).toBe(true);
        expect(sounds(custom, 18, 12)).toBe(false);
        expect(sounds(custom, 17, 11)).toBe(false);
        expect(sounds(custom, 19, 11)).toBe(false);
    });

    // Friday 18:00–02:00 belongs to Friday: it rings Saturday 01:59 even with Monday to Friday, but not Saturday 23:00.
    it("past midnight belongs to the day it starts", () => {
        const evenings = { ...day, schedule: "WEEKDAYS" as const, window: { start: 18 * 60, end: 2 * 60 } };
        expect(sounds(evenings, 16, 18)).toBe(true);
        expect(sounds(evenings, 17, 1, 59)).toBe(true);
        expect(sounds(evenings, 17, 2)).toBe(false);
        expect(sounds(evenings, 17, 23)).toBe(false);
        const nights = { ...day, window: { start: 22 * 60, end: 2 * 60 } };
        expect(sounds(nights, 16, 23)).toBe(true);
        expect(sounds(nights, 16, 3)).toBe(false);
    });

    // The same From and Until is the whole day.
    it("same from and until is the whole day", () => {
        const allDay = { ...day, window: { start: 8 * 60, end: 8 * 60 } };
        expect(windowLength(allDay.window)).toBe(24 * 60);
        expect(sounds(allDay, 16, 8)).toBe(true);
        expect(sounds(allDay, 16, 7, 59)).toBe(true);
        expect(sounds(allDay, 16, 23, 59)).toBe(true);
    });

    // Custom starts from the hours shown: all seven days from Every day, weekend off from Monday to Friday.
    // A day switched on gets those hours.
    it("switching to custom keeps the hours shown", () => {
        const window = { start: 9 * 60, end: 18 * 60 };
        const fromEveryDay = withSchedule({ ...day, window }, "CUSTOM");
        expect(Object.keys(fromEveryDay.days)).toEqual([...DAYS]);
        expect(new Set(Object.values(fromEveryDay.days).map((w) => JSON.stringify(w)))).toEqual(
            new Set([JSON.stringify(window)]),
        );
        const fromWeekdays = withSchedule({ ...day, schedule: "WEEKDAYS", window }, "CUSTOM");
        expect(Object.keys(fromWeekdays.days)).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
        const sundayOn = withDay(fromWeekdays, "SUNDAY", true);
        expect(sundayOn.days.SUNDAY).toEqual(window);
        const sundayLater = withTime(sundayOn, "SUNDAY", true, 10 * 60);
        expect(sundayLater.days.SUNDAY).toEqual({ start: 10 * 60, end: 18 * 60 });
        expect(sundayLater.days.MONDAY).toEqual(window);
        expect(withDay(sundayLater, "SUNDAY", false).days).not.toHaveProperty("SUNDAY");
    });

    // Mentions and replies sound anytime when allowed (the default), and follow the hours when not.
    it("mentions sound when allowed", () => {
        expect(sounds(day, 16, 23, 0, true)).toBe(true);
        expect(sounds({ ...day, mentions: false }, 16, 23, 0, true)).toBe(false);
    });

    // First turned on: Every day, 07:00 to 22:00, mentions sound.
    it("the default", () => {
        expect(DEFAULT_HOURS).toMatchObject({
            schedule: "EVERY_DAY",
            window: { start: 420, end: 1320 },
            mentions: true,
        });
    });
});

describe("withNotificationHours", () => {
    const hours: NotificationHoursSettings = { ...DEFAULT_HOURS, enabled: true };
    const lateFriday = new Date(2026, 9, 16, 23, 0);
    const noon = new Date(2026, 9, 16, 12, 0);
    const message = (content: Record<string, unknown> = {}): MatrixEvent =>
        new MatrixEvent({ type: "m.room.message", content: { msgtype: "m.text", body: "hola", ...content } });
    const loud = { notify: true, tweaks: { sound: "default" } };

    // Outside the hours: still a notification, no sound.
    it("drops the sound outside the hours", () => {
        expect(withNotificationHours(message(), loud, hours, lateFriday)).toEqual({ notify: true, tweaks: {} });
        expect(withNotificationHours(message(), loud, hours, noon)).toBe(loud);
    });

    // Mentions and replies (highlights) sound when allowed.
    it("keeps the sound for mentions", () => {
        const mention = { notify: true, tweaks: { sound: "default", highlight: true } };
        expect(withNotificationHours(message(), mention, hours, lateFriday)).toBe(mention);
        expect(withNotificationHours(message(), mention, { ...hours, mentions: false }, lateFriday)).toEqual({
            notify: true,
            tweaks: { highlight: true },
        });
    });

    // Ari's reminders (important and critical posts) always sound.
    it("keeps the sound for Ari's reminders", () => {
        for (const level of ["important", "critical"]) {
            const reminder = message({ "co.artise.automation": { id: "a1", level } });
            expect(withNotificationHours(reminder, loud, hours, lateFriday)).toBe(loud);
        }
        const normal = message({ "co.artise.automation": { id: "a1", level: "normal" } });
        expect(withNotificationHours(normal, loud, hours, lateFriday)?.tweaks).toEqual({});
    });

    // Off, silent already, or nothing to notify: untouched.
    it("leaves the rest alone", () => {
        expect(withNotificationHours(message(), loud, DEFAULT_HOURS, lateFriday)).toBe(loud);
        const quiet = { notify: true, tweaks: {} };
        expect(withNotificationHours(message(), quiet, hours, lateFriday)).toBe(quiet);
        expect(withNotificationHours(message(), null, hours, lateFriday)).toBeNull();
    });
});

describe("saved hours", () => {
    function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Record<string, string> } {
        const data: Record<string, string> = {};
        return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
    }

    // Each account keeps its own hours in this browser.
    it("keeps each account's hours", () => {
        const storage = memory();
        const mine = withSchedule({ ...DEFAULT_HOURS, enabled: true }, "WEEKDAYS");
        expect(saveHours("@ana:mas-k8s.artise.co", mine, storage)).toBe(true);
        saveHours("@ana:artise.co", DEFAULT_HOURS, storage);
        expect(loadHours("@ana:mas-k8s.artise.co", storage)).toEqual(mine);
        expect(loadHours("@ana:artise.co", storage)).toEqual(DEFAULT_HOURS);
        expect(loadHours("@luis:x", storage)).toEqual(DEFAULT_HOURS);
    });

    // Bad saved values fall back to the default (off), so they can never silence everything.
    it("ignores what it can't read", () => {
        const storage = memory();
        storage.data[HOURS_STORAGE_KEY] = JSON.stringify({
            "@a:x": { enabled: true, schedule: "NEVER", window: { start: -5, end: 99999 }, days: { SUNDAY: "x" } },
        });
        expect(loadHours("@a:x", storage)).toEqual({ ...DEFAULT_HOURS, enabled: true });
        storage.data[HOURS_STORAGE_KEY] = "{not json";
        expect(loadHours("@a:x", storage)).toEqual(DEFAULT_HOURS);
        expect(loadHours("@a:x", null)).toEqual(DEFAULT_HOURS);
        expect(saveHours("@a:x", DEFAULT_HOURS, null)).toBe(false);
    });
});
