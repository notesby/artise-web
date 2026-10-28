/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { app } from "electron";

import { applyArtiseLanguage, startupLanguage } from "./language.js";
import { readArtiseSettings } from "./settings.js";

vi.mock("electron", () => ({
    app: { getPreferredSystemLanguages: vi.fn(), commandLine: { appendSwitch: vi.fn() } },
}));
vi.mock("./settings.js", () => ({ readArtiseSettings: vi.fn() }));

describe("startupLanguage", () => {
    it.each([
        // [system languages, workspace language, expected, why]
        [["en-US"], "es", undefined, "an English system stays in English"],
        [["en-GB", "es"], "es", undefined, "any English stays as the system has it"],
        [["pt-BR"], "es", undefined, "a Portuguese system stays in Portuguese"],
        [["pt-PT"], "es", undefined, "so does European Portuguese"],
        [["de-DE"], "es", "es-MX", "another language gets the workspace's Spanish"],
        [["fr"], "es", "es-MX", "French too"],
        [[], "es", "es-MX", "an unknown system language gets the workspace's"],
        [["es-ES"], "es", undefined, "a Spanish system keeps its own regional Spanish"],
        [["de"], "pt", "pt-BR", "a Portuguese workspace starts in Portuguese"],
        [["de"], "fr", "fr", "a language without a regional form is used as it is"],
    ])("%j with a %s workspace gives %s: %s", (system, workspace, expected, _why) => {
        expect(startupLanguage(system, workspace)).toBe(expected);
    });
});

describe("applyArtiseLanguage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(readArtiseSettings).mockReturnValue({});
    });

    it("starts Chromium in Spanish on a German system", () => {
        // Element Web reads Chromium's language as the browser's, unless the person picked one in Settings.
        vi.mocked(app.getPreferredSystemLanguages).mockReturnValue(["de-DE"]);
        applyArtiseLanguage();
        expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("lang", "es-MX");
    });

    it("also sets LANGUAGE on Linux, where Chromium ignores --lang", () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("linux");
        vi.stubEnv("LANGUAGE", "de_DE");
        vi.mocked(app.getPreferredSystemLanguages).mockReturnValue(["de-DE"]);
        applyArtiseLanguage();
        expect(process.env.LANGUAGE).toBe("es_MX");
        vi.unstubAllEnvs();
    });

    it("leaves an English system alone", () => {
        vi.mocked(app.getPreferredSystemLanguages).mockReturnValue(["en-US"]);
        applyArtiseLanguage();
        expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
    });

    it("uses the workspace language the shell saved", () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ workspaceLanguage: "pt" });
        vi.mocked(app.getPreferredSystemLanguages).mockReturnValue(["ja"]);
        applyArtiseLanguage();
        expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("lang", "pt-BR");
    });

    it("falls back to the workspace's language if the system can't be read", () => {
        vi.mocked(app.getPreferredSystemLanguages).mockImplementation(() => {
            throw new Error("not ready");
        });
        applyArtiseLanguage();
        expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("lang", "es-MX");
    });
});
