/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseSettingsRow,
    type ArtiseSettingsRowId,
    type ArtiseSettingsViewModel as ArtiseSettingsViewModelInterface,
    type ArtiseSettingsViewSnapshot,
} from "@element-hq/web-shared-components";

import { artiseT } from "../i18n/artiseT";
import { type WorkspaceFile } from "../workspace/WorkspaceFile";
import { type SignInInfo } from "../artiseId/signInInfo";

export interface ArtiseSettingsViewModelProps {
    /** The signed-in workspace's file, or `null` on a server that isn't an Artise workspace. */
    workspace: WorkspaceFile | null;
    /** The signed-in person's Matrix ID: the admin doesn't get "write to the admin". */
    userId: string;
    /** The app's language (Element's key, e.g. `es`), passed on to Artise's pages. */
    language: string;
    /** Reads Artise ID's public sign-in info, for the Security row's page. */
    loadSignInInfo: () => Promise<SignInInfo | null>;
    /** Opens a web page outside the app (a new tab; the system browser in the desktop app). */
    openUrl: (url: string) => void;
    /** Opens a person's profile in the app. */
    openUser: (userId: string) => void;
}

/**
 * Artise's tab in Settings: the rows the phones have (Android #32/#33, iOS #24/#27), each shown only when the
 * workspace has somewhere for it to go.
 */
export class ArtiseSettingsViewModel
    extends BaseViewModel<ArtiseSettingsViewSnapshot, ArtiseSettingsViewModelProps>
    implements ArtiseSettingsViewModelInterface
{
    private securityUrl: string | undefined;

    public constructor(props: ArtiseSettingsViewModelProps) {
        super(props, { title: artiseT("artise|settings|tab"), rows: [] });
        this.snapshot.merge({ rows: this.rows() });
        void this.loadSecurity();
    }

    private async loadSecurity(): Promise<void> {
        const info = await this.props.loadSignInInfo();
        if (this.isDisposed || !info?.securityUrl) return;
        this.securityUrl = info.securityUrl;
        this.snapshot.merge({ rows: this.rows() });
    }

    private workspaceName(): string {
        return this.props.workspace?.name ?? artiseT("artise|settings|this_workspace");
    }

    private rows(): ArtiseSettingsRow[] {
        const { workspace, userId } = this.props;
        const rows: ArtiseSettingsRow[] = [];
        if (workspace?.links.help) {
            rows.push({
                id: "help",
                title: artiseT("artise|settings|help"),
                description: artiseT("artise|settings|help_description"),
                actionLabel: artiseT("artise|settings|help"),
            });
        }
        if (workspace?.contactUserId && workspace.contactUserId !== userId) {
            rows.push({
                id: "contact_admin",
                title: artiseT("artise|settings|contact_admin"),
                description: artiseT("artise|settings|contact_admin_description", { workspace: this.workspaceName() }),
                actionLabel: artiseT("artise|settings|contact_admin"),
            });
        }
        if (this.securityUrl) {
            rows.push({
                id: "security",
                title: artiseT("artise|settings|security"),
                description: artiseT("artise|settings|security_description"),
                actionLabel: artiseT("artise|settings|security_manage"),
            });
        }
        if (workspace?.links.delete_account) {
            rows.push({
                id: "delete_account",
                title: artiseT("artise|settings|delete_account"),
                description: artiseT("artise|settings|delete_account_description", {
                    workspace: this.workspaceName(),
                }),
                actionLabel: artiseT("artise|settings|delete_account"),
                destructive: true,
            });
        }
        return rows;
    }

    /** The delete-account page in the person's language, as iOS opens it (`?lang=es`). */
    private deleteAccountUrl(page: string): string {
        const url = new URL(page);
        const language = this.props.language.split("-")[0];
        if (language !== "en") url.searchParams.set("lang", language);
        return url.toString();
    }

    public open = (id: ArtiseSettingsRowId): void => {
        const { workspace, openUrl, openUser } = this.props;
        switch (id) {
            case "help":
                if (workspace?.links.help) openUrl(workspace.links.help);
                break;
            case "contact_admin":
                if (workspace?.contactUserId) openUser(workspace.contactUserId);
                break;
            case "security":
                if (this.securityUrl) openUrl(this.securityUrl);
                break;
            case "delete_account":
                if (workspace?.links.delete_account) openUrl(this.deleteAccountUrl(workspace.links.delete_account));
                break;
        }
    };
}
