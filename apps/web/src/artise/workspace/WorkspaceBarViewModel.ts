/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseWorkspaceBarViewModel as ArtiseWorkspaceBarViewModelInterface,
    type ArtiseWorkspaceBarViewSnapshot,
    type ArtiseWorkspaceItem,
} from "@element-hq/web-shared-components";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { artiseT } from "../i18n/artiseT";
import { getWorkspaceFile } from "./WorkspaceFile";
import { type WorkspaceEntry } from "./workspacesApi";

export interface WorkspaceBarViewModelProps {
    /** The signed-in client: its server's workspace file says which workspace this is. */
    client: MatrixClient;
    /** True inside the desktop app, whose own window switches workspaces: the bar isn't shown there. */
    inDesktopApp: boolean;
    /** Reads the person's workspaces (S-W1). */
    loadWorkspaces: () => Promise<WorkspaceEntry[] | null>;
    /** Opens another workspace's web app in place of this one. */
    navigate: (url: string) => void;
}

/**
 * The workspace bar above the chat list: this workspace's name and logo, and a menu of the person's other
 * workspaces that opens the picked one's own web app (`chat.<workspace>`), where its own session lives.
 */
export class WorkspaceBarViewModel
    extends BaseViewModel<ArtiseWorkspaceBarViewSnapshot, WorkspaceBarViewModelProps>
    implements ArtiseWorkspaceBarViewModelInterface
{
    /** Where each other workspace opens, by server name. */
    private webUrls = new Map<string, string>();
    private loadStarted = false;

    public constructor(props: WorkspaceBarViewModelProps) {
        super(props, {
            visible: false,
            current: { id: "", name: "" },
            others: [],
            switchLabel: "",
            menuTitle: artiseT("artise|workspace|menu_title"),
        });
        this.disposables.trackListener(props.client, ClientEvent.ClientWellKnown, this.onWellKnown);
        this.onWellKnown();
    }

    private readonly onWellKnown = (): void => {
        const workspace = getWorkspaceFile(this.props.client);
        const serverName = this.props.client.getDomain();
        if (this.props.inDesktopApp || !workspace?.name || !serverName) {
            this.snapshot.merge({ visible: false });
            return;
        }
        const current: ArtiseWorkspaceItem = {
            id: serverName,
            name: workspace.name,
            logo: workspace.branding.logo,
            color: workspace.branding.color,
        };
        this.snapshot.merge({
            visible: true,
            current,
            switchLabel: artiseT("artise|workspace|switch", { workspace: workspace.name }),
        });
        if (!this.loadStarted) {
            this.loadStarted = true;
            void this.loadOthers();
        }
    };

    private async loadOthers(): Promise<void> {
        const list = await this.props.loadWorkspaces();
        if (this.isDisposed || !list) return;
        const { current } = this.snapshot.current;
        const others: ArtiseWorkspaceItem[] = [];
        this.webUrls.clear();
        for (const entry of list) {
            if (entry.serverName === current.id) {
                // The list may know this workspace's logo before its own file does (or the reverse): keep both.
                this.snapshot.merge({
                    current: { ...current, logo: current.logo ?? entry.logo, color: current.color ?? entry.color },
                });
                continue;
            }
            if (this.webUrls.has(entry.serverName)) continue;
            this.webUrls.set(entry.serverName, entry.webUrl);
            others.push({ id: entry.serverName, name: entry.name, logo: entry.logo, color: entry.color });
        }
        this.snapshot.merge({ others });
    }

    public switchTo = (id: string): void => {
        const url = this.webUrls.get(id);
        if (url) this.props.navigate(url);
    };
}
