/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Names each notification after its workspace ("Casa · Ana"), so it's clear which one a message came from when
// several are open: the phones show the workspace's name the same way. An extra preload in each workspace's
// session (artise/views/workspaceView.ts), next to Element's own; compiled to CommonJS like Element's.

import { contextBridge, ipcRenderer } from "electron";

interface NotificationConstructor {
    new (title: string, options?: object): object;
}

void ipcRenderer.invoke("artise:workspaceName").then((name: unknown) => {
    if (typeof name !== "string" || !name) return;
    contextBridge.executeInMainWorld({
        func: (workspace: string): void => {
            const page = globalThis as unknown as { Notification?: NotificationConstructor };
            const Original = page.Notification;
            if (!Original) return;
            page.Notification = class extends Original {
                public constructor(title: string, options?: object) {
                    super(`${workspace} · ${title}`, options);
                }
            };
        },
        args: [name],
    });
});
