/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fs as memfs, vol } from "memfs";

import { workspaceKey } from "./context.js";
import { removeClosedWorkspaces, secretsOf } from "./cleanup.js";

vi.mock("node:fs/promises", () => ({ default: memfs.promises }));
vi.mock("electron", () => ({ session: {} }));
vi.mock("./workspaceView.js", () => ({ partitionFor: (key: string): string => `persist:workspace-${key}` }));

const PROFILE = "/home/ana/.config/Artise";

describe("secretsOf", () => {
    it("names the pickle key and the message-search passphrase Element keeps for a session", () => {
        expect(secretsOf("@ana:artise.co", "DEV")).toEqual(["@ana:artise.co|DEV", "seshat|@ana:artise.co|DEV"]);
    });
});

describe("removeClosedWorkspaces", () => {
    const casa = workspaceKey("artise.co");
    const prueba = workspaceKey("mas-k8s.artise.co");

    beforeEach(() => {
        vol.reset();
        vol.fromJSON(
            {
                [`Partitions/workspace-${casa}/IndexedDB/x`]: "",
                [`Partitions/workspace-${prueba}/IndexedDB/x`]: "",
                [`workspaces/${casa}/EventStore/seshat.db`]: "",
                [`workspaces/${prueba}/EventStore/seshat.db`]: "",
                // Element's own and the shell's data stay.
                "Partitions/artise-shell/x": "",
                "Local Storage/x": "",
            },
            PROFILE,
        );
    });

    it("removes every trace of the workspaces signed out of, and nothing else", async () => {
        // "Prueba MAS" was signed out of last time; "Casa" is still open.
        const removed = await removeClosedWorkspaces(PROFILE, ["artise.co"]);
        expect(removed.sort()).toEqual([`Partitions/workspace-${prueba}`, `workspaces/${prueba}`]);
        expect(Object.keys(vol.toJSON(PROFILE)).sort()).toEqual(
            [
                `${PROFILE}/Local Storage/x`,
                `${PROFILE}/Partitions/artise-shell/x`,
                `${PROFILE}/Partitions/workspace-${casa}/IndexedDB/x`,
                `${PROFILE}/workspaces/${casa}/EventStore/seshat.db`,
            ].sort(),
        );
    });

    it("copes with a fresh profile", async () => {
        vol.reset();
        expect(await removeClosedWorkspaces(PROFILE, [])).toEqual([]);
    });
});
