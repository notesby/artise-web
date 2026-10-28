/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app } from "electron";

import { readArtiseSettings } from "./settings.js";

/** Every workspace speaks Spanish until it says otherwise (co.artise.workspace.language). */
export const DEFAULT_WORKSPACE_LANGUAGE = "es";

/** The regional form Artise uses for a workspace's language: dates and numbers as people there write them. */
const REGIONAL: Record<string, string> = { es: "es-MX", en: "en-US", pt: "pt-BR" };

function base(locale: string): string {
    return locale.toLowerCase().split(/[-_]/)[0];
}

/**
 * The language Artise starts in, before the person picks one:
 * - the system's, if it's English or Portuguese (or the workspace's own language, in any regional form);
 * - else the workspace's language, which is Spanish on every workspace today.
 *
 * The person's own choice (Settings → General → Language) comes before both: Element Web keeps it and uses it
 * over the system's. Element Desktop would use the system's language, or English.
 *
 * @param system - the system's preferred languages, most preferred first.
 * @param workspaceLanguage - the workspace file's `language`.
 * @returns the locale to start Chromium with, or undefined to keep the system's.
 */
export function startupLanguage(system: readonly string[], workspaceLanguage: string): string | undefined {
    const preferred = system[0];
    const wanted = base(workspaceLanguage);
    if (preferred && ["en", "pt", wanted].includes(base(preferred))) return undefined;
    return REGIONAL[wanted] ?? workspaceLanguage;
}

/**
 * Starts Artise in {@link startupLanguage}'s language. Must run before the app is ready, while Chromium's
 * language can still be set; Element Web then reads it as the browser's language.
 */
export function applyArtiseLanguage(): void {
    let system: string[] = [];
    try {
        system = app.getPreferredSystemLanguages();
    } catch (e) {
        console.warn("Couldn't read the system's languages", e);
    }
    const workspaceLanguage = readArtiseSettings().workspaceLanguage ?? DEFAULT_WORKSPACE_LANGUAGE;
    const language = startupLanguage(system, workspaceLanguage);
    if (language) {
        console.log(`Starting in ${language}: the system prefers ${system[0] ?? "no language"}`);
        app.commandLine.appendSwitch("lang", language);
        // Chromium on Linux takes its language from the environment instead of --lang.
        if (process.platform === "linux") process.env.LANGUAGE = language.replace("-", "_");
    }
}
