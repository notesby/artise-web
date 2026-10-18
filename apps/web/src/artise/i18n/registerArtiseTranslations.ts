/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import _ from "lodash";
import { KEY_SEPARATOR, registerTranslations } from "@element-hq/web-shared-components";
import { type Translation } from "matrix-web-i18n";

import wording from "./wording.json";

/** Artise's texts: translation key → Element's language key (`en`, `es`, `pt`, `pt-br`) → text. */
export type ArtiseTranslations = Record<string, Record<string, Translation>>;

let onInTests = false;

/**
 * Turns Artise's words on in unit tests, which run with Element's words otherwise: Element's own tests and
 * snapshots check Element's texts ("Rooms"), and would all change with every Artise word.
 *
 * @param on - Whether Artise's tests want the words.
 */
export function setArtiseTranslationsInTests(on: boolean): void {
    onInTests = on;
}

/**
 * Registers Artise's words over Element's texts, for every language at once.
 *
 * Called right after Element registers a language (the hook in `i18n/settings.ts`), so Artise's words win over
 * Element's, and before the server's `custom_translations_url`, so a workspace can still change a word.
 * The texts ship inside the app: they don't depend on the server's config, and the desktop app gets them too.
 *
 * @param translations - The texts to register; Artise's wording file (tools/artise/web_wording.py) by default.
 */
export function registerArtiseTranslations(translations: ArtiseTranslations = wording): void {
    // oxlint-disable-next-line node/no-process-env
    if (process.env.NODE_ENV === "test" && !onInTests) return;
    const byLanguage = new Map<string, Record<string, unknown>>();
    for (const [key, texts] of Object.entries(translations)) {
        for (const [language, text] of Object.entries(texts)) {
            let tree = byLanguage.get(language);
            if (!tree) {
                tree = {};
                byLanguage.set(language, tree);
            }
            _.set(tree, key.split(KEY_SEPARATOR), text);
        }
    }
    for (const [language, tree] of byLanguage) {
        registerTranslations(language, tree);
    }
}
