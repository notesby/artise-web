/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { type IActionsObject } from "matrix-js-sdk/src/pushprocessor";

/** The content field Ari puts on its automation posts (reminders, alerts), as the phones read it. */
export const AUTOMATION_FIELD = "co.artise.automation";

/** How much an Ari post asks for attention. An unknown level counts as `normal`, as on iOS and Android. */
export type AutomationLevel = "normal" | "important" | "critical";

/**
 * The automation level of an event, or `undefined` when it isn't one of Ari's automation posts.
 *
 * @param event - A decrypted event.
 */
export function automationLevel(event: MatrixEvent): AutomationLevel | undefined {
    const automation: unknown = event.getContent()[AUTOMATION_FIELD];
    if (typeof automation !== "object" || automation === null) return undefined;
    const level = (automation as Record<string, unknown>).level;
    return level === "important" || level === "critical" ? level : "normal";
}

/**
 * The push actions with Ari's level applied, as the phones apply it (iOS ArtiseAutomationLevel, Android's
 * Reminders channel): an important post always notifies, even in a muted chat; a critical one also sounds.
 * The browser's own "sound off" setting still wins, since the person chose it for every chat.
 *
 * @param event - The event being notified about.
 * @param actions - What the push rules decided, or `null` when no rule matched.
 * @returns The actions to use; the same object when the event isn't an important or critical Ari post.
 */
export function withAutomationLevel(event: MatrixEvent, actions: IActionsObject | null): IActionsObject | null {
    const level = automationLevel(event);
    if (level === "important") {
        return { notify: true, tweaks: { ...actions?.tweaks } };
    }
    if (level === "critical") {
        return { notify: true, tweaks: { ...actions?.tweaks, sound: actions?.tweaks.sound ?? "default" } };
    }
    return actions;
}
