/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { _t } from "../../languageHandler";
import type wording from "./wording.json";

/** The keys of Artise's own texts (`ARTISE_TEXTS` in tools/artise/web_wording.py). */
export type ArtiseTextKey = Extract<keyof typeof wording, `artise|${string}`>;

/**
 * One of Artise's own texts, in the person's language.
 *
 * Artise's texts aren't in Element's string files (editing those would conflict at every tag merge), so
 * Element's `TranslationKey` type doesn't list them; {@link ArtiseTextKey} does, from the same JSON the app
 * registers at start (`registerArtiseTranslations`).
 *
 * @param key - An Artise text's key, e.g. `"artise|settings|help"`.
 * @param variables - Values for the text's `%(name)s` placeholders.
 */
export function artiseT(key: ArtiseTextKey, variables?: Record<string, string | number>): string {
    // The cast is the one place Artise's keys meet Element's key type; ArtiseTextKey keeps it to real keys.
    return _t(key as TranslationKey, variables);
}

/**
 * An Artise text's key where Element wants a translation key to translate later, such as a Settings tab's name.
 *
 * @param key - An Artise text's key.
 */
export function artiseTd(key: ArtiseTextKey): TranslationKey {
    // Same cast as artiseT: ArtiseTextKey keeps it to Artise's real keys.
    return key as TranslationKey;
}
