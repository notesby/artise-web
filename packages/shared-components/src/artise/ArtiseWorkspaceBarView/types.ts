/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";

/** A workspace as the bar shows it. */
export interface ArtiseWorkspaceItem {
    /** Its Matrix server name, e.g. "mas-k8s.artise.co": what the view model is told when it's picked. */
    id: string;
    /** Its name, e.g. "Prueba MAS". */
    name: string;
    /** An `https:` URL to its logo. Without one, the bar shows the name's first letter. */
    logo?: string;
    /** Its accent colour as `#RRGGBB`, behind the letter when there's no logo. */
    color?: string;
}

export interface ArtiseWorkspaceBarViewSnapshot {
    /** False outside an Artise workspace and inside the desktop app, which switches workspaces itself. */
    visible: boolean;
    /** The workspace on screen. */
    current: ArtiseWorkspaceItem;
    /** The person's other workspaces. With none, the bar shows the name only, with no menu. */
    others: ArtiseWorkspaceItem[];
    /** The button's name for screen readers, e.g. "Cambiar de espacio de trabajo (ahora: Prueba MAS)". */
    switchLabel: string;
    /** The menu's heading, e.g. "Tus espacios de trabajo". */
    menuTitle: string;
}

export interface ArtiseWorkspaceBarViewActions {
    /** The person picked another workspace. */
    switchTo: (id: string) => void;
}

export type ArtiseWorkspaceBarViewModel = ViewModel<ArtiseWorkspaceBarViewSnapshot, ArtiseWorkspaceBarViewActions>;
