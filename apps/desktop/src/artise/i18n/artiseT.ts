/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import counterpart from "counterpart";

import { DESKTOP_WORDING } from "./wording.js";

/** The keys of the desktop's own texts (`DESKTOP_TEXTS` in tools/artise/web_wording.py). */
export type DesktopTextKey = keyof typeof DESKTOP_WORDING;

type Language = "en" | "es" | "pt";

/**
 * The language of Artise's texts for one of Element's locales: Spanish and Portuguese in any of their
 * regional forms (es-MX, pt-BR), English for everything else.
 *
 * @param locale - an Element locale such as `"es"`, `"es-mx"` or `"pt_BR"`.
 */
export function textLanguage(locale: string | undefined): Language {
    const base = (locale ?? "").toLowerCase().split(/[-_]/)[0];
    return base === "es" || base === "pt" ? base : "en";
}

/**
 * One of the desktop's own texts, in the app's current language (the one Element Desktop's own menus use).
 *
 * Artise's texts stay out of Element Desktop's string files, which change at every tag merge.
 *
 * @param key - a desktop text's key, e.g. `"artise|desktop|about|menu"`.
 * @param variables - values for the text's `%(name)s` placeholders.
 * @param locale - the locale to use; the app's current one when left out.
 */
export function artiseT(
    key: DesktopTextKey,
    variables: Record<string, string | number> = {},
    locale: string = counterpart.getLocale(),
): string {
    const text: string = DESKTOP_WORDING[key][textLanguage(locale)];
    return text.replace(/%\((\w+)\)s/g, (placeholder, name: string) =>
        name in variables ? String(variables[name]) : placeholder,
    );
}
