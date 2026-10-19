/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { NotificationHoursViewModel, fromTime, toTime } from "./NotificationHoursViewModel";
import { HOURS_STORAGE_KEY, loadHours } from "./notificationHours";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const USER = "@ana:mas-k8s.artise.co";

function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Record<string, string> } {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

function makeVm(storage: Pick<Storage, "getItem" | "setItem"> | null = memory(), inDesktopApp = false) {
    return new NotificationHoursViewModel({ userId: USER, storage, language: "es", inDesktopApp });
}

describe("NotificationHoursViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    it("reads and writes times", () => {
        expect([toTime(7 * 60), toTime(22 * 60 + 5), toTime(0)]).toEqual(["07:00", "22:05", "00:00"]);
        expect([fromTime("07:30"), fromTime("23:59"), fromTime("24:00"), fromTime("x")]).toEqual([
            450,
            1439,
            null,
            null,
        ]);
    });

    // Off at first; turned on, it's every day 07:00 to 22:00, saved for this account.
    it("starts off and saves when turned on", () => {
        const storage = memory();
        const vm = makeVm(storage);
        expect(vm.getSnapshot()).toMatchObject({
            enabled: false,
            schedule: "EVERY_DAY",
            start: "07:00",
            end: "22:00",
            mentions: true,
        });
        vm.setEnabled(true);
        expect(vm.getSnapshot().enabled).toBe(true);
        expect(loadHours(USER, storage).enabled).toBe(true);
    });

    // Monday to Friday shows what happens on the weekend; Custom shows each day, named in the app's language.
    it("shows the days for each choice", () => {
        const vm = makeVm();
        vm.setEnabled(true);
        vm.setSchedule("WEEKDAYS");
        expect(vm.getSnapshot().footer).toBe("On Saturday and Sunday, notifications arrive without sound.");
        vm.setSchedule("CUSTOM");
        const days = vm.getSnapshot().days ?? [];
        expect(days.map((d) => d.label)).toEqual([
            "Lunes",
            "Martes",
            "Miércoles",
            "Jueves",
            "Viernes",
            "Sábado",
            "Domingo",
        ]);
        expect(days.map((d) => d.on)).toEqual([true, true, true, true, true, false, false]);
    });

    // Times and days change and stay changed.
    it("changes hours and days", () => {
        const storage = memory();
        const vm = makeVm(storage);
        vm.setEnabled(true);
        vm.setTime(undefined, false, "20:30");
        expect(vm.getSnapshot().end).toBe("20:30");
        vm.setSchedule("CUSTOM");
        vm.setDay("SUNDAY", true);
        vm.setTime("SUNDAY", true, "10:00");
        expect(vm.getSnapshot().days?.find((d) => d.id === "SUNDAY")).toMatchObject({
            on: true,
            start: "10:00",
            end: "20:30",
        });
        vm.setMentions(false);
        expect(loadHours(USER, storage)).toMatchObject({
            schedule: "CUSTOM",
            mentions: false,
            days: { SUNDAY: { start: 600, end: 1230 } },
        });
        // Opened again later: the same settings.
        expect(makeVm(storage).getSnapshot()).toMatchObject({ enabled: true, schedule: "CUSTOM", mentions: false });
    });

    // Unknown values from the view are ignored.
    it("ignores what it doesn't know", () => {
        const storage = memory();
        const vm = makeVm(storage);
        vm.setSchedule("NEVER");
        vm.setDay("FUNDAY", true);
        vm.setTime(undefined, true, "nope");
        expect(storage.data[HOURS_STORAGE_KEY]).toBeUndefined();
    });

    // Storage blocked: it still works for this visit, and says it won't be kept.
    it("says when the browser won't keep the settings", () => {
        const vm = makeVm(null);
        vm.setEnabled(true);
        expect(vm.getSnapshot()).toMatchObject({
            enabled: true,
            warning: "This browser won't keep these settings (its storage is blocked).",
        });
    });

    it("says computer in the desktop app", () => {
        expect(makeVm(memory(), true).getSnapshot().description).toContain("on this computer");
        expect(makeVm(memory(), false).getSnapshot().description).toContain("in this browser");
    });
});
