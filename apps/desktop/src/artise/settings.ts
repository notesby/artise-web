/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/** Artise's own settings, kept apart from Element's store so neither file's format depends on the other. */
export interface ArtiseSettings {
    /** Whether the person agreed to send crash reports; absent until they've been asked. */
    crashReports?: boolean;
    /** The language of the person's first workspace (co.artise.workspace.language), saved by the shell. */
    workspaceLanguage?: string;
    /** The server names of the workspaces the person chose to open, opened again at the next start. */
    openWorkspaces?: string[];
}

const FILE_NAME = "artise-settings.json";

function settingsPath(): string {
    return path.join(app.getPath("userData"), FILE_NAME);
}

/** Artise's settings, or none when the file is missing or unreadable (a first start, or a damaged file). */
export function readArtiseSettings(): ArtiseSettings {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * Changes some of Artise's settings and saves them at once.
 *
 * @param change - the settings to change; the others stay.
 */
export function updateArtiseSettings(change: Partial<ArtiseSettings>): ArtiseSettings {
    const settings = { ...readArtiseSettings(), ...change };
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 4));
    return settings;
}
