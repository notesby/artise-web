/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fetchMock from "@fetch-mock/vitest";

import SdkConfig from "../SdkConfig";
import { _t } from "../i18n";
import { setLanguage } from "../i18n/settings";
import { setupTranslationOverridesForTests } from "../i18n/__mocks__";
import esStrings from "../i18n/strings/es.json";
import ptBrStrings from "../i18n/strings/pt_BR.json";
import enStrings from "../i18n/strings/en_EN.json";
import { setupLanguageMock } from "../test/setupLanguage";
import { setArtiseTranslationsInTests } from "./i18n/registerArtiseTranslations";

// Artise's wording (tools/artise/web_wording.py) goes through Element's own setLanguage, as in the app:
// a wrong language key or a broken plural shows up here, not on artise.co.
describe("Artise's words", () => {
    beforeEach(() => {
        setArtiseTranslationsInTests(true);
        // The shared test setup only knows en, de and lv; give it Artise's languages, keyed as the
        // app's languages.json keys them (lower case, "-" for "_").
        fetchMock.removeRoute("languages");
        fetchMock
            .get(
                "include:/i18n/languages.json?",
                { "en": "en_EN.json", "es": "es.json", "pt-br": "pt_BR.json" },
                { name: "languages" },
            )
            .get("end:/es.json", esStrings, { name: "artise-es" })
            .get("end:/pt_BR.json", ptBrStrings, { name: "artise-pt-br" })
            .get("end:/en_EN.json", enStrings, { name: "artise-en" });
    });

    afterEach(async () => {
        SdkConfig.reset();
        fetchMock.removeRoute("i18n-override");
        fetchMock.removeRoute("artise-es");
        fetchMock.removeRoute("artise-pt-br");
        fetchMock.removeRoute("artise-en");
        fetchMock.removeRoute("languages");
        setupLanguageMock();
        setArtiseTranslationsInTests(false);
        await setLanguage("en");
    });

    it("say 'Cerrar sesión' and 'chat' in Spanish", async () => {
        await setLanguage("es");
        expect(_t("action|sign_out")).toBe("Cerrar sesión");
        expect(_t("action|leave_room")).toBe("Salir del chat");
        expect(_t("common|n_rooms", { count: 1 })).toBe("1 chat");
        expect(_t("common|n_rooms", { count: 3 })).toBe("3 chats");
    });

    it("say 'Sair' and 'conversa' in Brazilian Portuguese", async () => {
        await setLanguage("pt-br");
        expect(_t("action|sign_out")).toBe("Sair");
        expect(_t("common|n_rooms", { count: 3 })).toBe("3 conversas");
    });

    it("say 'Sign out' instead of Element's 'Remove this device' in English", async () => {
        await setLanguage("en");
        expect(_t("action|sign_out")).toBe("Sign out");
        expect(_t("room|intro|user_created", { displayName: "Ana" })).toBe("Ana created this chat.");
    });

    it("keep Element's own texts where Artise has no word", async () => {
        await setLanguage("es");
        expect(_t("action|cancel")).toBe("Cancelar");
    });

    it("let the server's custom_translations_url still change a word for its workspace", async () => {
        await setupTranslationOverridesForTests({ "action|sign_out": { es: "Salir de Familia" } });
        await setLanguage("es");
        expect(_t("action|sign_out")).toBe("Salir de Familia");
    });

    it("stay off in Element's own tests, which check Element's words", async () => {
        setArtiseTranslationsInTests(false);
        await setLanguage("en");
        expect(_t("common|rooms")).toBe("Rooms");
    });
});
