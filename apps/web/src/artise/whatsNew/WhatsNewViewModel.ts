/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseWhatsNewViewModel as ArtiseWhatsNewViewModelInterface,
    type ArtiseWhatsNewViewSnapshot,
} from "@element-hq/web-shared-components";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { artiseT } from "../i18n/artiseT";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";

/** This release's changes; change it (and the `artise|whats_new|item_*` texts) when the items change. */
export const WHATS_NEW_EDITION = "2026-10-18";

/** Where this browser remembers the last edition the person dismissed. */
export const WHATS_NEW_SEEN_KEY = "artise.whatsNew.seen";

/** The bit of `Storage` the card uses. */
export type WhatsNewStorage = Pick<Storage, "getItem" | "setItem">;

export interface WhatsNewViewModelProps {
    /** The signed-in client: the card shows on Artise workspaces only. */
    client: MatrixClient;
    /** This browser's storage, or `null` when it's blocked (private window): the card then shows each visit. */
    storage: WhatsNewStorage | null;
}

/**
 * "What's new" above the chat list, as on iOS (`ArtiseWhatsNew`): this release's few changes, until the person
 * dismisses them; the next edition shows again.
 *
 * Unlike iOS, a browser that never stored an edition does see the card: on the web this is the first edition,
 * so everyone is someone the changes are new to.
 */
export class WhatsNewViewModel
    extends BaseViewModel<ArtiseWhatsNewViewSnapshot, WhatsNewViewModelProps>
    implements ArtiseWhatsNewViewModelInterface
{
    public constructor(props: WhatsNewViewModelProps) {
        super(props, {
            visible: false,
            title: artiseT("artise|whats_new|title"),
            items: [
                artiseT("artise|whats_new|item_1"),
                artiseT("artise|whats_new|item_2"),
                artiseT("artise|whats_new|item_3"),
            ],
            doneLabel: artiseT("artise|whats_new|done"),
        });
        this.disposables.trackListener(props.client, ClientEvent.ClientWellKnown, this.update);
        this.update();
    }

    private seenEdition(): string | null {
        try {
            return this.props.storage?.getItem(WHATS_NEW_SEEN_KEY) ?? null;
        } catch {
            return null;
        }
    }

    private readonly update = (): void => {
        const isArtise = getWorkspaceFile(this.props.client) !== null;
        this.snapshot.merge({ visible: isArtise && this.seenEdition() !== WHATS_NEW_EDITION });
    };

    public dismiss = (): void => {
        try {
            this.props.storage?.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW_EDITION);
        } catch {
            // Storage blocked: hidden for this visit only.
        }
        this.snapshot.merge({ visible: false });
    };
}
