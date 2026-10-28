/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";
import { type WebContents } from "electron";

import { artiseUserDataDir, runInView, workspaceKey } from "./context.js";

describe("workspaceKey", () => {
    it("is stable, short and different per workspace", () => {
        expect(workspaceKey("artise.co")).toBe(workspaceKey("artise.co"));
        expect(workspaceKey("artise.co")).toMatch(/^[0-9a-f]{16}$/);
        expect(workspaceKey("artise.co")).not.toBe(workspaceKey("mas-k8s.artise.co"));
    });
});

describe("artiseUserDataDir", () => {
    it("is the workspace's folder while Element's code runs for it, and nothing outside", async () => {
        // seshat.ts puts each workspace's index in its own folder through this.
        expect(artiseUserDataDir()).toBeUndefined();
        const context = {
            key: "k",
            serverName: "artise.co",
            webContents: {} as WebContents,
            userDataDir: "/p/workspaces/k",
        };
        await runInView(context, async () => {
            await Promise.resolve();
            expect(artiseUserDataDir()).toBe("/p/workspaces/k");
        });
    });
});
