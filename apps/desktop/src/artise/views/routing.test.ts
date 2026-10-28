/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import EventEmitter from "node:events";
import { type BrowserWindow, type IpcMain, type IpcMainEvent, type WebContents } from "electron";

import { currentView, registerView, unregisterView, type ViewContext } from "./context.js";
import { installRouting, isWorkspaceUser, routeFor } from "./routing.js";

function contents(id: number): WebContents {
    return { id, send: vi.fn() } as unknown as WebContents;
}

function view(id: number, serverName: string): ViewContext {
    return { key: `k${id}`, serverName, webContents: contents(id), userDataDir: `/profile/workspaces/k${id}` };
}

describe("routeFor", () => {
    const casa = view(1, "artise.co");

    it("refuses another workspace's user's keys", () => {
        // A view may only ask for its own Matrix users' pickle keys.
        expect(routeFor(casa, "ipcCall", { name: "getPickleKey", args: ["@ana:artise.co", "DEV"] })).toBe("element");
        expect(routeFor(casa, "ipcCall", { name: "getPickleKey", args: ["@ana:mas-k8s.artise.co", "DEV"] })).toBe(
            "refuse",
        );
        expect(routeFor(casa, "ipcCall", { name: "destroyPickleKey", args: [undefined] })).toBe("refuse");
    });

    it("sends Seshat to the view's own instance, for its own users only", () => {
        expect(routeFor({ ...casa, seshat: vi.fn() }, "seshat", { name: "searchEventIndex" })).toBe("seshat");
        expect(
            routeFor({ ...casa, seshat: vi.fn() }, "seshat", { name: "initEventIndex", args: ["@x:evil.example"] }),
        ).toBe("refuse");
        // Without its own instance (Seshat not installed), it's ignored rather than sent to the shared one.
        expect(routeFor(casa, "seshat", { name: "searchEventIndex" })).toBe("drop");
    });

    it("keeps media-auth answers to the view", () => {
        expect(routeFor(casa, "userAccessToken", "token")).toBe("drop");
    });

    it("lets everything else through to Element, for the view", () => {
        expect(routeFor(casa, "ipcCall", { name: "clearStorage" })).toBe("element");
        expect(routeFor(casa, "setBadgeCount", 3)).toBe("element");
    });
});

describe("isWorkspaceUser", () => {
    it("matches the server name exactly", () => {
        expect(isWorkspaceUser("@ana:artise.co", "artise.co")).toBe(true);
        expect(isWorkspaceUser("@ana:mas-k8s.artise.co", "artise.co")).toBe(false);
        expect(isWorkspaceUser("@ana:notartise.co", "artise.co")).toBe(false);
        expect(isWorkspaceUser("ana:artise.co", "artise.co")).toBe(false);
    });
});

describe("installRouting", () => {
    const host = contents(100);
    let window: BrowserWindow;
    let ipcMain: IpcMain;
    let shown: ViewContext | undefined;
    const casa = view(1, "artise.co");
    const prueba = view(2, "mas-k8s.artise.co");

    beforeEach(() => {
        window = Object.create({ webContents: host }) as BrowserWindow;
        ipcMain = new EventEmitter() as unknown as IpcMain;
        shown = undefined;
        installRouting(window, ipcMain, () => shown);
        registerView(casa);
        registerView(prueba);
        return () => {
            unregisterView(1);
            unregisterView(2);
        };
    });

    const from = (sender: WebContents): IpcMainEvent => ({ sender }) as IpcMainEvent;

    it("makes the window's web contents the shown workspace's, else its own", () => {
        expect(window.webContents).toBe(host);
        shown = prueba;
        expect(window.webContents).toBe(prueba.webContents);
    });

    it("runs Element's handler for the view that sent the message, also after its awaits", async () => {
        // Element's ipcCall handler answers through global.mainWindow.webContents: it must reach the sender, not
        // the shown workspace.
        shown = prueba;
        const answered: WebContents[] = [];
        ipcMain.on("ipcCall", async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            answered.push(window.webContents);
            expect(currentView()).toBe(casa);
        });
        ipcMain.emit("ipcCall", from(casa.webContents), { name: "getAppVersion", id: 1 });
        await vi.waitFor(() => expect(answered).toEqual([casa.webContents]));
    });

    it("answers a refused call with an error, without running Element's handler", () => {
        const handler = vi.fn();
        ipcMain.on("ipcCall", handler);
        ipcMain.emit("ipcCall", from(casa.webContents), {
            name: "getPickleKey",
            id: 7,
            args: ["@ana:mas-k8s.artise.co"],
        });
        expect(handler).not.toHaveBeenCalled();
        expect(casa.webContents.send).toHaveBeenCalledWith("ipcReply", {
            id: 7,
            error: { message: "Not this workspace's user" },
        });
    });

    it("calls only the sending view's Seshat", () => {
        const shared = vi.fn();
        ipcMain.on("seshat", shared);
        casa.seshat = vi.fn(() => expect(currentView()).toBe(casa));
        prueba.seshat = vi.fn();
        ipcMain.emit("seshat", from(casa.webContents), { name: "searchEventIndex", id: 1 });
        expect(casa.seshat).toHaveBeenCalled();
        expect(prueba.seshat).not.toHaveBeenCalled();
        expect(shared).not.toHaveBeenCalled();
    });

    it("leaves messages from anything else, such as the window itself, to Element as before", () => {
        const handler = vi.fn(() => expect(currentView()).toBeUndefined());
        ipcMain.on("ipcCall", handler);
        ipcMain.emit("ipcCall", from(host), { name: "getAppVersion" });
        expect(handler).toHaveBeenCalled();
    });
});
