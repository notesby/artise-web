/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useRef, useState } from "react";
import { Button, IconButton, Menu, MenuItem, Text } from "@vector-im/compound-web";
import OverflowIcon from "@vector-im/compound-design-tokens/assets/web/icons/overflow-horizontal";
import EditIcon from "@vector-im/compound-design-tokens/assets/web/icons/edit";
import DeleteIcon from "@vector-im/compound-design-tokens/assets/web/icons/delete";
import FolderIcon from "@vector-im/compound-design-tokens/assets/web/icons/folder";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseNotesView.module.css";
import { type ArtiseNotesTreeItem, type ArtiseNotesViewModel } from "./types";

/** "More actions" on a row of the list: rename, move, delete. */
export function RowActions({
    item,
    vm,
}: Readonly<{ item: ArtiseNotesTreeItem; vm: ArtiseNotesViewModel }>): JSX.Element {
    const { labels } = useViewModel(vm);
    const [open, setOpen] = useState(false);
    return (
        <Menu
            open={open}
            onOpenChange={setOpen}
            title={item.name}
            align="end"
            trigger={
                <IconButton className={styles.rowMenu} aria-label={`${labels.moreActions}: ${item.name}`} size="24px">
                    <OverflowIcon />
                </IconButton>
            }
        >
            <MenuItem Icon={EditIcon} label={labels.rename} onSelect={() => vm.rename(item.path)} hideChevron />
            <MenuItem Icon={FolderIcon} label={labels.move} onSelect={() => vm.move(item.path)} hideChevron />
            <MenuItem
                Icon={DeleteIcon}
                label={labels.delete}
                kind="critical"
                onSelect={() => vm.remove(item.path)}
                hideChevron
            />
        </Menu>
    );
}

/** A hidden file picker behind a button: "Agregar archivo". */
export function FileButton({
    label,
    onFiles,
    kind = "secondary",
}: Readonly<{ label: string; onFiles: (files: File[]) => void; kind?: "secondary" | "tertiary" }>): JSX.Element {
    const input = useRef<HTMLInputElement>(null);
    return (
        <>
            <Button kind={kind} size="md" onClick={() => input.current?.click()}>
                {label}
            </Button>
            <input
                ref={input}
                type="file"
                multiple
                hidden
                data-testid="artise-notes-file-input"
                onChange={(ev) => {
                    const files = [...(ev.target.files ?? [])];
                    ev.target.value = "";
                    if (files.length) onFiles(files);
                }}
            />
        </>
    );
}

/** The action waiting for the person: a name to type, a folder to pick, or a delete to confirm. */
export function ActionPanel({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element | null {
    const { action, labels } = useViewModel(vm);
    if (!action) return null;
    const error = action.error && (
        <Text id="artise-notes-action-error" size="sm" className={styles.nameError} role="alert">
            {action.error}
        </Text>
    );

    if (action.kind === "rename" || action.kind === "newFolder") {
        const label = action.kind === "rename" ? labels.rename : labels.folderName;
        return (
            <form
                className={styles.actionPanel}
                onSubmit={(ev) => {
                    ev.preventDefault();
                    vm.confirmAction();
                }}
            >
                <Text weight="semibold">{action.kind === "rename" ? labels.rename : labels.newFolder}</Text>
                <input
                    className={styles.nameInput}
                    aria-label={label}
                    placeholder={label}
                    value={action.name}
                    // The person just asked for this: start typing.
                    autoFocus
                    onChange={(ev) => vm.changeActionName(ev.target.value)}
                    onKeyDown={(ev) => ev.key === "Escape" && vm.cancelAction()}
                    aria-invalid={!!action.error}
                    aria-describedby={action.error ? "artise-notes-action-error" : undefined}
                />
                {action.kind === "newFolder" && (
                    <Text size="sm" className={styles.message}>
                        {action.hint}
                    </Text>
                )}
                {error}
                <div className={styles.fileButtons}>
                    <Button kind="primary" size="md" type="submit" disabled={action.saving}>
                        {action.kind === "rename" ? labels.rename : labels.create}
                    </Button>
                    <Button kind="tertiary" size="md" type="button" onClick={vm.cancelAction}>
                        {labels.cancel}
                    </Button>
                </div>
            </form>
        );
    }

    if (action.kind === "move") {
        return (
            <div className={styles.actionPanel}>
                <Text weight="semibold">{action.title}</Text>
                <ul className={styles.list}>
                    {action.targets.map((target) => (
                        <li key={target.path}>
                            <button
                                type="button"
                                className={styles.row}
                                disabled={target.here || action.saving}
                                onClick={() => vm.confirmAction(target.path)}
                            >
                                <FolderIcon className={styles.rowIcon} width="18px" height="18px" aria-hidden />
                                <span className={styles.rowName}>{target.label}</span>
                                {target.here && <span className={styles.suggestionPath}>{labels.moveHere}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
                {error}
                <div className={styles.fileButtons}>
                    <Button kind="tertiary" size="md" onClick={vm.cancelAction}>
                        {labels.cancel}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.actionPanel} role="alertdialog" aria-label={action.title}>
            <Text weight="semibold">{action.title}</Text>
            <Text className={styles.message}>{action.message}</Text>
            {error}
            <div className={styles.fileButtons}>
                <Button
                    kind="primary"
                    destructive
                    size="md"
                    onClick={() => vm.confirmAction()}
                    disabled={action.saving}
                >
                    {action.confirmLabel}
                </Button>
                <Button kind="tertiary" size="md" onClick={vm.cancelAction}>
                    {labels.cancel}
                </Button>
            </div>
        </div>
    );
}
