/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fs as memfs, vol } from "memfs";
import EventEmitter from "node:events";
import { app } from "electron";

import ProtocolHandler from "../protocol.js";

// The hook in protocol.ts: the Artise build answers only co.artise.desktop:, never Element's element://.

const USER_DATA_DIR = "/Users/name/Library/Application Support/Artise";

vi.mock("node:fs", () => ({ default: memfs }));
vi.mock("../build-config.js", () => ({
    getBuildConfig: (): object => ({ appId: "co.artise.desktop", protocol: "co.artise.desktop" }),
}));
vi.mock("electron", () => {
    const emitter = new EventEmitter();
    return {
        app: {
            isPackaged: true,
            getPath: vi.fn().mockReturnValue("/Users/name/Library/Application Support/Artise"),
            getAppPath: vi.fn().mockReturnValue("/bin/artise-desktop"),
            setAsDefaultProtocolClient: vi.fn(),
            on: emitter.on.bind(emitter),
        },
        ipcMain: { handle: vi.fn() },
    };
});

describe("ProtocolHandler in the Artise build", () => {
    beforeEach(() => {
        vol.reset();
        vol.fromJSON({ "./sso-sessions.json": "{}" }, USER_DATA_DIR);
        vi.mocked(app.setAsDefaultProtocolClient).mockClear();
        vi.spyOn(process, "execPath", "get").mockReturnValue("/bin/artise-desktop");
    });

    const args = { userDataPath: USER_DATA_DIR, devtools: false, update: false, hidden: false };

    it("registers only Artise's scheme", () => {
        // Installing Artise must not make it the handler for Element's links.
        new ProtocolHandler("co.artise.desktop").initialise({ ...args, positional: ["/bin/artise-desktop"] });

        const schemes = vi.mocked(app.setAsDefaultProtocolClient).mock.calls.map(([scheme]) => scheme);
        expect(new Set(schemes)).toEqual(new Set(["co.artise.desktop"]));
    });

    it("opens a sign-in callback on its own scheme", () => {
        // co.artise.desktop:/vector/webapp/?code=… is the callback Artise ID and each workspace use.
        const loadURL = vi.fn();
        vi.stubGlobal("mainWindow", { loadURL });

        const opened = new ProtocolHandler("co.artise.desktop").initialise({
            ...args,
            positional: ["/bin/artise-desktop", "co.artise.desktop:/vector/webapp/?code=abc&state=xyz"],
        });

        expect(opened).toBe(true);
        expect(loadURL).toHaveBeenCalledWith("vector://vector/webapp/?code=abc&state=xyz");
    });

    it("keeps Artise ID's sign-in returns away from Element Web", () => {
        // Same scheme and path as a workspace's return, but Artise ID's state: the shell takes it.
        const loadURL = vi.fn();
        vi.stubGlobal("mainWindow", { loadURL });

        const opened = new ProtocolHandler("co.artise.desktop").initialise({
            ...args,
            positional: ["/bin/artise-desktop", "co.artise.desktop:/vector/webapp/?code=abc&state=artise-id.xyz"],
        });

        // Nothing was loaded, so a cold start still opens the shell.
        expect(opened).toBe(false);
        expect(loadURL).not.toHaveBeenCalled();
    });

    it("ignores element:// links", () => {
        const loadURL = vi.fn();
        vi.stubGlobal("mainWindow", { loadURL });

        const opened = new ProtocolHandler("co.artise.desktop").initialise({
            ...args,
            positional: ["/bin/artise-desktop", "element://vector/webapp/#/room/!x:artise.co"],
        });

        expect(opened).toBe(false);
        expect(loadURL).not.toHaveBeenCalled();
    });
});
