/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";
import { type IActionsObject } from "matrix-js-sdk/src/pushprocessor";

import { automationLevel, withAutomationLevel } from "./automationLevel";

const post = (content: Record<string, unknown>): MatrixEvent =>
    new MatrixEvent({ type: "m.room.message", room_id: "!ari", sender: "@wikibot:artise.co", content });

const muted: IActionsObject = { notify: false, tweaks: {} };
const quiet: IActionsObject = { notify: true, tweaks: {} };
const loud: IActionsObject = { notify: true, tweaks: { sound: "ring", highlight: true } };

describe("automationLevel", () => {
    it("reads important and critical", () => {
        expect(automationLevel(post({ "body": "x", "co.artise.automation": { level: "important" } }))).toBe(
            "important",
        );
        expect(automationLevel(post({ "body": "x", "co.artise.automation": { level: "critical" } }))).toBe("critical");
    });

    it("counts an unknown level as normal, so a newer Ari can't make an older app misbehave", () => {
        expect(automationLevel(post({ "body": "x", "co.artise.automation": { level: "urgentísimo" } }))).toBe("normal");
        expect(automationLevel(post({ "body": "x", "co.artise.automation": {} }))).toBe("normal");
    });

    it("is undefined for an ordinary message", () => {
        expect(automationLevel(post({ body: "hola" }))).toBeUndefined();
        expect(automationLevel(post({ "body": "x", "co.artise.automation": "critical" }))).toBeUndefined();
    });
});

describe("withAutomationLevel", () => {
    it("leaves an ordinary message as the push rules decided", () => {
        expect(withAutomationLevel(post({ body: "hola" }), muted)).toBe(muted);
        expect(withAutomationLevel(post({ body: "hola" }), null)).toBeNull();
    });

    it("leaves a normal Ari post as the push rules decided", () => {
        const event = post({ "body": "x", "co.artise.automation": { level: "normal" } });
        expect(withAutomationLevel(event, muted)).toBe(muted);
    });

    it("notifies about an important post even in a muted chat, without adding a sound", () => {
        const event = post({ "body": "Pagar la luz", "co.artise.automation": { level: "important" } });
        expect(withAutomationLevel(event, muted)).toEqual({ notify: true, tweaks: {} });
        expect(withAutomationLevel(event, null)).toEqual({ notify: true, tweaks: {} });
    });

    it("notifies with a sound about a critical post, even in a muted chat", () => {
        const event = post({ "body": "Medicina ahora", "co.artise.automation": { level: "critical" } });
        expect(withAutomationLevel(event, muted)).toEqual({ notify: true, tweaks: { sound: "default" } });
        expect(withAutomationLevel(event, quiet)).toEqual({ notify: true, tweaks: { sound: "default" } });
    });

    it("keeps the chat's own sound and highlight on a critical post", () => {
        const event = post({ "body": "Medicina ahora", "co.artise.automation": { level: "critical" } });
        expect(withAutomationLevel(event, loud)).toEqual({ notify: true, tweaks: { sound: "ring", highlight: true } });
    });
});
