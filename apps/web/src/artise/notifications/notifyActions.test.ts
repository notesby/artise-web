/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { MatrixEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { artiseNotifyActions } from "./notifyActions";
import { DEFAULT_HOURS, saveHours } from "./notificationHours";

const USER = "@ana:mas-k8s.artise.co";

function client(actions: unknown): MatrixClient {
    return {
        getPushActionsForEvent: vi.fn().mockReturnValue(actions),
        getSafeUserId: () => USER,
    } as unknown as MatrixClient;
}

describe("artiseNotifyActions", () => {
    afterEach(() => localStorage.clear());

    const event = new MatrixEvent({ type: "m.room.message", content: { msgtype: "m.text", body: "hola" } });
    const lateFriday = new Date(2026, 9, 16, 23, 0);

    // With this browser's hours on, a late message shows without sound; with them off, it sounds.
    it("applies this account's notification hours", () => {
        const loud = { notify: true, tweaks: { sound: "default" } };
        expect(artiseNotifyActions(event, client(loud), lateFriday)).toBe(loud);
        saveHours(USER, { ...DEFAULT_HOURS, enabled: true }, localStorage);
        expect(artiseNotifyActions(event, client(loud), lateFriday)).toEqual({ notify: true, tweaks: {} });
    });

    // Ari's critical post in a muted chat: it notifies and sounds, even late.
    it("keeps Ari's rules", () => {
        saveHours(USER, { ...DEFAULT_HOURS, enabled: true }, localStorage);
        const critical = new MatrixEvent({
            type: "m.room.message",
            content: {
                "msgtype": "m.text",
                "body": "¡Pagar luz!",
                "co.artise.automation": { id: "a", level: "critical" },
            },
        });
        expect(artiseNotifyActions(critical, client({ notify: false, tweaks: {} }), lateFriday)).toEqual({
            notify: true,
            tweaks: { sound: "default" },
        });
    });
});
