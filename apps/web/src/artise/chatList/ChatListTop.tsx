/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";

import { WorkspaceBar } from "../workspace/WorkspaceBar";
import { WhatsNewCard } from "../whatsNew/WhatsNewCard";

/** What Artise adds above the chat list: the workspace bar, then "What's new". Each draws nothing when not needed. */
export function ChatListTop(): JSX.Element {
    return (
        <>
            <WorkspaceBar />
            <WhatsNewCard />
        </>
    );
}
