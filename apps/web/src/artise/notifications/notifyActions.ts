/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { type IActionsObject } from "matrix-js-sdk/src/pushprocessor";

import { withAutomationLevel } from "./automationLevel";
import { loadHours, withNotificationHours } from "./notificationHours";

function browserStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

/**
 * The push actions for an event, with Artise's rules on top of the server's: Ari's important and critical posts
 * always notify, and outside the notification hours notifications show without sound.
 *
 * @param now - The clock, replaceable in tests.
 */
export function artiseNotifyActions(
    event: MatrixEvent,
    client: MatrixClient,
    now: Date = new Date(),
): IActionsObject | null {
    const actions = withAutomationLevel(event, client.getPushActionsForEvent(event));
    return withNotificationHours(event, actions, loadHours(client.getSafeUserId(), browserStorage()), now);
}
