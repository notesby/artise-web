/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    app,
    ipcMain,
    type BrowserWindow,
    type Input,
    type MenuItemConstructorOptions,
    type WebContents,
    type WebContentsView,
} from "electron";

import { DEFAULT_COLOR, initials, RAIL_WIDTH, type RailItem } from "../rail/renderRail.js";
import { SHELL_ORIGIN } from "../shell/render.js";
import { setArtiseTrayItems } from "../trayItems.js";
import { type WorkspaceInfo } from "../workspace/discovery.js";
import { unregisterView, type ViewContext } from "./context.js";
import { installRouting } from "./routing.js";
import { overlayImage, UnreadCounts } from "./unread.js";
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
    if (input.type !== "keyDown" || !modifier || input.alt || input.shift || !/^[1-9]$/.test(input.key)) {
        return undefined;
    }
    return Number(input.key) - 1;
}

/**
 * A workspace's name as the rail, the tray and the window title show it: its workspace file's, else its server
 * name.
 *
 * @param info - the workspace.
 */
export function workspaceName(info: WorkspaceInfo): string {
    return info.name ?? info.serverName;
}

/** What the views need from the shell around them. */
export interface WorkspaceViewsDeps {
    /** The rail's view, on the left of the window (artise/rail). */
    rail: WebContentsView;
    /** resources/build/, for Windows' badge overlays; undefined while unknown. */
    buildDir(): string | undefined;
    /** Rebuilds Element's tray menu, so its workspace items show the new counts (tray.ts). */
    refreshTray(): void;
}

/**
 * The open workspaces' views in Element's main window, right of the rail: all running, one shown. The window's
 * own web contents stays an empty page under them.
 */
export class WorkspaceViews {
    private views: WorkspaceView[] = [];
    private shownIndex = 0;
    private readonly host: WebContents;
    private refreshingRail = false;
    /** Every workspace's unread count; their total is the dock and taskbar badge. */
    public readonly unread = new UnreadCounts();

    public constructor(
        private readonly window: BrowserWindow,
        private readonly deps: WorkspaceViewsDeps,
    ) {
        this.host = installRouting(
            window,
            ipcMain,
            () => this.shownContext(),
            (view, args) => this.badge(view, args),
        );
        window.on("resize", () => this.fit());
        // Element tells the web app Artise is quitting through the window; tell every workspace.
        app.on("before-quit", () => {
            for (const { view } of this.views) view.webContents.send("before-quit");
        });
        this.unread.onChange(() => this.changed());
        setArtiseTrayItems(() => this.trayItems());
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
     * Element's badge code gets every workspace's count added up, instead of the count of whichever workspace
     * reported last. On Windows, the overlay with that total too (Element Web draws one per page).
     */
    private badge(view: ViewContext, args: unknown[]): unknown[] {
        const [count, , isError] = args;
        // An error badge (a workspace can't sync) is shown as Element shows it.
        if (isError) return args;
        this.unread.set(view.key, typeof count === "number" ? count : 0);
        const total = this.unread.total;
        if (process.platform !== "win32") return [total];
        const buildDir = this.deps.buildDir();
        return [total, buildDir ? overlayImage(total, buildDir) : undefined];
    }

    /** The rail's items, in order. */
    public railItems(): RailItem[] {
        return this.views.map((open, index) => ({
            name: workspaceName(open.info),
            initials: initials(workspaceName(open.info)),
            color: open.info.color ?? DEFAULT_COLOR,
            hasLogo: !!open.info.logo,
            unread: this.unread.of(open.context.key),
            shown: index === this.shownIndex,
        }));
    }

    private trayItems(): MenuItemConstructorOptions[] {
        if (this.views.length === 0) return [];
        return [
            ...this.views.map((open, index): MenuItemConstructorOptions => {
                const unread = this.unread.of(open.context.key);
                return {
                    label: unread > 0 ? `${workspaceName(open.info)} (${unread})` : workspaceName(open.info),
                    type: "radio",
                    checked: index === this.shownIndex,
                    click: () => {
                        this.show(index);
                        this.window.show();
                        this.window.focus();
                    },
                };
            }),
            { type: "separator" },
        ];
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
        this.window.contentView.addChildView(this.deps.rail);
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
        const shown = this.views[index];
        if (!shown) return;
        this.shownIndex = index;
        this.views.forEach(({ view }, i) => view.setVisible(i === index));
        this.fit();
        this.window.setTitle(shown.view.webContents.getTitle() || "Artise");
        if (this.window.isFocused()) shown.view.webContents.focus();
        this.changed();
    }

    /**
     * The open workspace whose web app put this ID in its sign-in state, for sending the return back to it.
     *
     * @param sessionId - the `element-desktop-ssoid` from the return.
     */
    public bySessionId(sessionId: string): WorkspaceView | undefined {
        return this.views.find((open) => open.sessionId === sessionId);
    }

    /** The rail and the tray show what changed: the shown workspace, or a count. */
    private changed(): void {
        this.refreshRail();
        this.deps.refreshTray();
    }

    /** Draws the rail again; once its page has loaded, if it's loading (its own link is being answered). */
    private refreshRail(): void {
        const { webContents } = this.deps.rail;
        if (this.refreshingRail) return;
        if (webContents.isLoading()) {
            this.refreshingRail = true;
            webContents.once("did-stop-loading", () => {
                this.refreshingRail = false;
                this.refreshRail();
            });
            return;
        }
        void webContents.loadURL(`${SHELL_ORIGIN}/rail`);
    }

    private fit(): void {
        const { width, height } = this.window.getContentBounds();
        this.deps.rail.setBounds({ x: 0, y: 0, width: RAIL_WIDTH, height });
        for (const { view } of this.views) {
            view.setBounds({ x: RAIL_WIDTH, y: 0, width: Math.max(width - RAIL_WIDTH, 0), height });
        }
    }
}
