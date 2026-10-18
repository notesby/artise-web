/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";

/** Which row of Artise's settings tab. */
export type ArtiseSettingsRowId = "help" | "contact_admin" | "security" | "delete_account";

/** One row of Artise's settings tab: what it is, a line about it, and its button. */
export interface ArtiseSettingsRow {
    id: ArtiseSettingsRowId;
    /** The row's name, e.g. "Ayuda". */
    title: string;
    /** One line under the name. */
    description: string;
    /** The button's text, e.g. "Administrar en Artise ID". */
    actionLabel: string;
    /** Red button, for actions that can't be undone (deleting the account). */
    destructive?: boolean;
}

export interface ArtiseSettingsViewSnapshot {
    /** The tab's heading. */
    title: string;
    /**
     * The rows to show, in order. A row the workspace has no page for (no `links.help`, no admin) is left out
     * by the view model, so the view never shows a button that does nothing.
     */
    rows: ArtiseSettingsRow[];
}

export interface ArtiseSettingsViewActions {
    /** The person pressed a row's button. */
    open: (id: ArtiseSettingsRowId) => void;
}

export type ArtiseSettingsViewModel = ViewModel<ArtiseSettingsViewSnapshot, ArtiseSettingsViewActions>;
