/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";

export interface ArtiseWhatsNewViewSnapshot {
    /** False until there's something new, and again once it's dismissed. */
    visible: boolean;
    /** The card's heading, e.g. "Novedades". */
    title: string;
    /** This release's few changes, one line each. */
    items: string[];
    /** The dismiss button, e.g. "Entendido". */
    doneLabel: string;
}

export interface ArtiseWhatsNewViewActions {
    /** The person read it: hide it until the next release's changes. */
    dismiss: () => void;
}

export type ArtiseWhatsNewViewModel = ViewModel<ArtiseWhatsNewViewSnapshot, ArtiseWhatsNewViewActions>;
