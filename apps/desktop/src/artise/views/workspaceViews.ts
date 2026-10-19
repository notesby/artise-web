/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, ipcMain, type BrowserWindow, type Input, type WebContents } from "electron";

import { type WorkspaceInfo } from "../workspace/discovery.js";
import { unregisterView, type ViewContext } from "./context.js";
import { installRouting } from "./routing.js";
import { createWorkspaceView, type WorkspaceView } from "./workspaceView.js";

/**
 * Which workspace a shortcut asks for: Ctrl+1…9 (⌘+1…9 on macOS) for the 1st…9th workspace.
 *
 * @param input - the key pressed.
 * @param platform - the OS.
 * @returns the workspace's index, or undefined for any other key.
 */
export function shortcutIndex(
    input: Pick<Input, "type" | "key" | "control" | "meta" | "alt" | "shift">,
    platform: string,
): number | undefined {
    const modifier = platform === "darwin" ? input.meta && !input.control : input.control && !input.meta;
    if (input.type !== "keyDown" || !modifier || input.alt || input.shift || !/^[1-9]$/.test(input.key))
        return undefined;
    return Number(input.key) - 1;
}

/**
 * The open workspaces' views in Element's main window: all running, one shown. The window's own web contents
 * stays an empty page under them.
 */
export class WorkspaceViews {
    private views: WorkspaceView[] = [];
    private shownIndex = 0;
    private readonly host: WebContents;

    public constructor(private readonly window: BrowserWindow) {
        this.host = installRouting(window, ipcMain, () => this.shownContext());
        window.on("resize", () => this.fit());
        // Element tells the web app Artise is quitting through the window; tell every workspace.
        app.on("before-quit", () => {
            for (const { view } of this.views) view.webContents.send("before-quit");
        });
    }

    /** The window's own web contents, under the views. */
    public get hostWebContents(): WebContents {
        return this.host;
    }

    /** The open workspaces, in the order shown on the rail. */
    public get open(): readonly WorkspaceView[] {
        return this.views;
    }

    /** The shown workspace's index. */
    public get shown(): number {
        return this.shownIndex;
    }

    private shownContext(): ViewContext | undefined {
        return this.views[this.shownIndex]?.context;
    }

    /**
     * Opens these workspaces, each in its own view, and shows the first. Workspaces already open stay as they are.
     *
     * @param infos - the workspaces, the one to show first at the front.
     */
    public async openAll(infos: readonly WorkspaceInfo[]): Promise<void> {
        for (const info of infos) {
            if (this.views.some((open) => open.info.serverName === info.serverName)) continue;
            const created = await createWorkspaceView(info);
            created.view.setVisible(false);
            this.window.contentView.addChildView(created.view);
            this.watch(created);
            this.views.push(created);
        }
        const first = this.views.findIndex((open) => open.info.serverName === infos[0]?.serverName);
        this.show(Math.max(first, 0));
    }

    private watch(open: WorkspaceView): void {
        const { webContents } = open.view;
        webContents.on("before-input-event", (event, input) => {
            const index = shortcutIndex(input, process.platform);
            if (index === undefined || index >= this.views.length) return;
            event.preventDefault();
            this.show(index);
        });
        webContents.on("page-title-updated", (_event, title) => {
            if (this.views[this.shownIndex] === open) this.window.setTitle(title);
        });
        webContents.once("destroyed", () => unregisterView(open.context.webContents.id));
    }

    /**
     * Shows one workspace. The others keep running, hidden.
     *
     * @param index - the workspace's index.
     */
    public show(index: number): void {
        if (!this.views[index]) return;
        this.shownIndex = index;
        this.views.forEach(({ view }, i) => view.setVisible(i === index));
        this.fit();
        const { webContents } = this.views[index].view;
        this.window.setTitle(webContents.getTitle() || "Artise");
        if (this.window.isFocused()) webContents.focus();
    }

    /**
     * The open workspace whose web app put this ID in its sign-in state, for sending the return back to it.
     *
     * @param sessionId - the `element-desktop-ssoid` from the return.
     */
    public bySessionId(sessionId: string): WorkspaceView | undefined {
        return this.views.find((open) => open.sessionId === sessionId);
    }

    private fit(): void {
        const { width, height } = this.window.getContentBounds();
        for (const { view } of this.views) view.setBounds({ x: 0, y: 0, width, height });
    }
}
