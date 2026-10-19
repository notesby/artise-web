/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, desktopCapturer, ipcMain, session, WebContentsView, type Session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAsarPath } from "../../asar.js";
import { getBuildConfig } from "../../build-config.js";
import { getConfig } from "../../config.js";
import { setDisplayMediaCallback } from "../../displayMediaCallback.js";
import Store from "../../store.js";
import webContentsHandler from "../../webcontents-handler.js";
import { type WorkspaceInfo } from "../workspace/discovery.js";
import { workspaceConfig } from "../workspace/workspaceConfig.js";
import { registerView, type ViewContext, workspaceKey } from "./context.js";
import { setupViewMediaAuth } from "./mediaAuth.js";
import { setPermissionPolicy } from "./permissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One open workspace: its view in the window, and what it's about. */
export interface WorkspaceView {
    info: WorkspaceInfo;
    view: WebContentsView;
    context: ViewContext;
    /** The `element-desktop-ssoid` its web app puts in sign-in returns, to send them back to this view. */
    sessionId: string;
    /** Being closed: its web app signed out. */
    closing?: boolean;
}

/**
 * The partition a workspace's web app keeps its data in: its own, kept across starts.
 *
 * @param key - the workspace's key.
 */
export function partitionFor(key: string): string {
    return `persist:workspace-${key}`;
}

/**
 * Serves Artise's web app from webapp.asar on `vector://vector/webapp/`, in one workspace's session: Element's
 * handler in electron-main.ts, which serves only the default session.
 */
async function serveWebApp(workspaceSession: Session): Promise<void> {
    if (workspaceSession.protocol.isProtocolRegistered("vector")) return;
    const asarPath = path.normalize(await getAsarPath());
    workspaceSession.protocol.registerFileProtocol("vector", (request, callback) => {
        const url = new URL(request.url);
        const parts = url.pathname.split("/");
        if (request.method !== "GET" || url.host !== "vector" || parts[1] !== "webapp") {
            callback({ error: -6 }); // FILE_NOT_FOUND
            return;
        }
        if (parts.at(-1) === "") parts[parts.length - 1] = "index.html";
        const relative = path.normalize(path.join(...parts.slice(2)));
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            callback({ error: -6 });
            return;
        }
        callback({ path: path.join(asarPath, relative) });
    });
}

/** Screen sharing for calls: Element's picker, shown in the view that asked (electron-main.ts does it for one). */
function shareScreens(workspaceSession: Session, view: WebContentsView): void {
    workspaceSession.setDisplayMediaRequestHandler(
        (_request, callback) => {
            if (process.env.XDG_SESSION_TYPE === "wayland") {
                // On Wayland the system's portal picks one source.
                void (async (): Promise<void> => {
                    try {
                        const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
                        callback({ video: sources[0] });
                    } catch {
                        // The person closed the portal's picker.
                        callback({ video: { id: "", name: "" } });
                    }
                })();
            } else {
                view.webContents.send("openDesktopCapturerSourcePicker");
            }
            setDisplayMediaCallback(callback);
        },
        { useSystemPicker: true },
    );
}

/**
 * Loads Seshat (encrypted message search) once more for this workspace, so it has its own index: each import of
 * seshat.js with its own query is a new module, with its own state. Its handler is taken off ipcMain and called
 * only for this view (artise/views/routing.ts); its index goes in the workspace's folder (the seshat.ts hook).
 */
let seshatLoads = Promise.resolve();
function loadSeshat(context: ViewContext): Promise<void> {
    seshatLoads = seshatLoads.then(async () => {
        const before = new Set(ipcMain.listeners("seshat"));
        try {
            await import(`../../seshat.js?workspace=${context.key}`);
        } catch (e) {
            console.warn(`Seshat isn't available for ${context.serverName}`, e);
            return;
        }
        const added = ipcMain.listeners("seshat").filter((listener) => !before.has(listener));
        for (const listener of added) ipcMain.removeListener("seshat", listener as (...args: unknown[]) => void);
        context.seshat = added[0] as ViewContext["seshat"];
    });
    return seshatLoads;
}

/**
 * Creates a workspace's view: its own persistent session (cookies, IndexedDB, the Matrix session), Element's
 * preload, link handling and media auth, a permission policy, its own config and sign-in return address, and
 * its own Seshat. Hidden views keep running, so every workspace syncs and notifies.
 *
 * @param info - the workspace.
 */
export async function createWorkspaceView(info: WorkspaceInfo): Promise<WorkspaceView> {
    const key = workspaceKey(info.serverName);
    const workspaceSession = session.fromPartition(partitionFor(key));
    await serveWebApp(workspaceSession);
    setPermissionPolicy(workspaceSession);
    if (!workspaceSession.getPreloadScripts().some((script) => script.id === "artise-notifications")) {
        workspaceSession.registerPreloadScript({
            id: "artise-notifications",
            type: "frame",
            filePath: path.join(__dirname, "notifications.cjs"),
        });
    }
    workspaceSession.setSpellCheckerEnabled(Store.instance?.get("spellCheckerEnabled", true) ?? true);

    const view = new WebContentsView({
        webPreferences: {
            session: workspaceSession,
            preload: path.join(__dirname, "..", "..", "preload.cjs"),
            nodeIntegration: false,
            contextIsolation: true,
            webgl: true,
            // Hidden workspaces keep their timers running, so they keep syncing.
            backgroundThrottling: false,
        },
    });
    const webContents = view.webContents;
    webContentsHandler(webContents);
    setupViewMediaAuth(workspaceSession, webContents);
    shareScreens(workspaceSession, view);

    // Per-view answers to Element Web's two questions; a view's own handler wins over ipcMain's.
    const sessionId = `artise-${key}`;
    webContents.ipc.handle("getConfig", () => workspaceConfig(getConfig(), info));
    webContents.ipc.handle("getProtocol", () => ({ protocol: getBuildConfig().protocol, sessionId }));
    // For the notifications preload (notifications.cts).
    webContents.ipc.handle("artise:workspaceName", () => info.name ?? info.serverName);

    const context: ViewContext = {
        key,
        serverName: info.serverName,
        webContents,
        userDataDir: path.join(app.getPath("userData"), "workspaces", key),
    };
    registerView(context);
    await loadSeshat(context);
    void webContents.loadURL("vector://vector/webapp/");
    return { info, view, context, sessionId };
}
