/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useState } from "react";
import classNames from "classnames";
import { Menu, MenuItem, Text } from "@vector-im/compound-web";
import ChevronDownIcon from "@vector-im/compound-design-tokens/assets/web/icons/chevron-down";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseWorkspaceBarView.module.css";
import { type ArtiseWorkspaceBarViewModel, type ArtiseWorkspaceItem } from "./types";

interface WorkspaceMarkProps {
    workspace: ArtiseWorkspaceItem;
    /** Set by Compound's MenuItem when the mark is its icon. */
    className?: string;
}

/** The workspace's logo, or its first letter on its colour. Decorative: the name is always next to it. */
function WorkspaceMark({ workspace, className }: Readonly<WorkspaceMarkProps>): JSX.Element {
    if (workspace.logo) {
        return <img className={classNames(styles.mark, className)} src={workspace.logo} alt="" aria-hidden />;
    }
    return (
        <span
            className={classNames(styles.mark, styles.letter, className)}
            style={workspace.color ? { backgroundColor: workspace.color, color: "#fff" } : undefined}
            aria-hidden
        >
            {workspace.name.charAt(0).toUpperCase()}
        </span>
    );
}

interface ArtiseWorkspaceBarViewProps {
    vm: ArtiseWorkspaceBarViewModel;
}

/**
 * The workspace's name and logo above the chat list, as on the phones' top bar. When the person has other
 * workspaces it opens a menu of them; picking one opens that workspace.
 *
 * @example
 * ```tsx
 * <ArtiseWorkspaceBarView vm={workspaceBarViewModel} />
 * ```
 */
export function ArtiseWorkspaceBarView({ vm }: Readonly<ArtiseWorkspaceBarViewProps>): JSX.Element | null {
    const { visible, current, others, switchLabel, menuTitle } = useViewModel(vm);
    const [open, setOpen] = useState(false);
    if (!visible) return null;

    const name = (
        <>
            <WorkspaceMark workspace={current} />
            <Text as="span" size="md" weight="semibold" className={styles.name}>
                {current.name}
            </Text>
        </>
    );

    if (others.length === 0) {
        return (
            <div className={styles.bar} data-testid="artise-workspace-bar">
                {name}
            </div>
        );
    }

    return (
        <div className={styles.bar} data-testid="artise-workspace-bar">
            <Menu
                open={open}
                onOpenChange={setOpen}
                title={menuTitle}
                align="start"
                trigger={
                    <button type="button" className={styles.trigger} aria-label={switchLabel}>
                        {name}
                        <ChevronDownIcon className={styles.chevron} width="20px" height="20px" aria-hidden />
                    </button>
                }
            >
                {others.map((workspace) => (
                    <MenuItem
                        key={workspace.id}
                        Icon={<WorkspaceMark workspace={workspace} />}
                        label={workspace.name}
                        onSelect={() => vm.switchTo(workspace.id)}
                        hideChevron
                    />
                ))}
            </Menu>
        </div>
    );
}
