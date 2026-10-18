/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { ArtiseWorkspaceBarView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { WorkspaceBarViewModel } from "./WorkspaceBarViewModel";
import { fetchWorkspaces } from "./workspacesApi";

/**
 * The workspace's name above the chat list, with a menu of the person's other workspaces (browser only).
 * Draws nothing outside an Artise workspace and inside the desktop app.
 */
export function WorkspaceBar(): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(
        () =>
            new WorkspaceBarViewModel({
                client,
                inDesktopApp: !!window.electron,
                loadWorkspaces: () => fetchWorkspaces(client),
                // Same tab: this workspace's session stays saved on its own site, so coming back needs no sign-in.
                navigate: (url) => window.location.assign(url),
            }),
    );
    return <ArtiseWorkspaceBarView vm={vm} />;
}
