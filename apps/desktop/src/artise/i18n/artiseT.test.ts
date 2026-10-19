/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { artiseT, textLanguage } from "./artiseT.js";

describe("textLanguage", () => {
    it.each([
        ["es", "es"],
        ["es-mx", "es"],
        ["es_MX", "es"],
        ["pt", "pt"],
        ["pt-br", "pt"],
        ["en", "en"],
        ["en-gb", "en"],
        ["fr", "en"],
        [undefined, "en"],
    ])("reads %s as %s", (locale, expected) => {
        // Regional forms share their language's texts; languages Artise doesn't have fall back to English.
        expect(textLanguage(locale)).toBe(expected);
    });
});

describe("artiseT", () => {
    it("gives the text in the requested language", () => {
        expect(artiseT("artise|desktop|about|menu", {}, "es-mx")).toBe("Acerca de Artise");
        expect(artiseT("artise|desktop|about|menu", {}, "pt-br")).toBe("Sobre o Artise");
        expect(artiseT("artise|desktop|about|menu", {}, "de")).toBe("About Artise");
    });

    it("fills in placeholders", () => {
        expect(artiseT("artise|desktop|about|version", { version: "0.1.0" }, "es")).toBe("Versión 0.1.0");
    });

    it("leaves a placeholder with no value as it is", () => {
        // Shows the gap instead of the word "undefined".
        expect(artiseT("artise|desktop|about|version", {}, "en")).toBe("Version %(version)s");
    });
});
