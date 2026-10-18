/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import classNames from "classnames";
import { Button, IconButton, InlineSpinner, Text } from "@vector-im/compound-web";
import ArrowLeftIcon from "@vector-im/compound-design-tokens/assets/web/icons/arrow-left";
import ChevronRightIcon from "@vector-im/compound-design-tokens/assets/web/icons/chevron-right";
import FolderIcon from "@vector-im/compound-design-tokens/assets/web/icons/folder";
import DocumentIcon from "@vector-im/compound-design-tokens/assets/web/icons/document";
import AttachmentIcon from "@vector-im/compound-design-tokens/assets/web/icons/attachment";

import { useViewModel } from "../../core/viewmodel";
import { ArtiseNoteView } from "../ArtiseNoteView/ArtiseNoteView";
import styles from "./ArtiseNotesView.module.css";
import { type ArtiseNotesContent, type ArtiseNotesTreeItem, type ArtiseNotesViewModel } from "./types";

interface ArtiseNotesViewProps {
    vm: ArtiseNotesViewModel;
}

function TreeRow({
    item,
    selected,
    vm,
}: Readonly<{ item: ArtiseNotesTreeItem; selected: boolean; vm: ArtiseNotesViewModel }>): JSX.Element {
    const Icon = item.kind === "folder" ? FolderIcon : item.kind === "note" ? DocumentIcon : AttachmentIcon;
    const onClick = (): void => (item.kind === "folder" ? vm.toggleFolder(item.path) : vm.select(item.path));
    return (
        <li>
            <button
                type="button"
                className={classNames(styles.row, { [styles.selected]: selected })}
                style={{ paddingInlineStart: `calc(var(--cpd-space-2x) + ${item.depth} * var(--cpd-space-4x))` }}
                onClick={onClick}
                aria-expanded={item.kind === "folder" ? !!item.expanded : undefined}
                aria-current={selected ? "page" : undefined}
            >
                {item.kind === "folder" && (
                    <ChevronRightIcon
                        className={classNames(styles.chevron, { [styles.open]: item.expanded })}
                        width="16px"
                        height="16px"
                        aria-hidden
                    />
                )}
                <Icon className={styles.rowIcon} width="18px" height="18px" aria-hidden />
                <span className={styles.rowName}>{item.name}</span>
            </button>
        </li>
    );
}

function Content({ content, vm }: Readonly<{ content: ArtiseNotesContent; vm: ArtiseNotesViewModel }>): JSX.Element {
    const { labels } = useViewModel(vm);
    switch (content.kind) {
        case "none":
        case "error":
            return (
                <Text className={styles.message} role={content.kind === "error" ? "alert" : undefined}>
                    {content.text}
                </Text>
            );
        case "loading":
            return <InlineSpinner className={styles.spinner} />;
        case "note":
            return (
                <ArtiseNoteView
                    document={content.document}
                    onOpenLink={vm.openLink}
                    onOpenEmbed={vm.openEmbed}
                    taskLabel={labels.task}
                />
            );
        case "image":
            return (
                <figure className={styles.figure}>
                    {content.src ? (
                        <img className={styles.photo} src={content.src} alt={content.title} />
                    ) : (
                        <InlineSpinner className={styles.spinner} />
                    )}
                    <figcaption className={styles.caption}>
                        <Text size="sm">{content.title}</Text>
                        <Button kind="tertiary" size="md" onClick={() => vm.download(content.path)}>
                            {labels.download}
                        </Button>
                    </figcaption>
                </figure>
            );
        case "file":
            return (
                <div className={styles.file}>
                    <Text weight="semibold">{content.title}</Text>
                    <Text className={styles.message}>{content.text}</Text>
                    <div className={styles.fileButtons}>
                        {content.canOpen && (
                            <Button kind="primary" size="md" onClick={() => vm.openFile(content.path)}>
                                {labels.open}
                            </Button>
                        )}
                        <Button kind="secondary" size="md" onClick={() => vm.download(content.path)}>
                            {labels.download}
                        </Button>
                    </div>
                </div>
            );
    }
}

/**
 * A chat's notes: its folders and files on the left, the picked note, photo or file on the right.
 *
 * @example
 * ```tsx
 * <ArtiseNotesView vm={notesViewModel} />
 * ```
 */
export function ArtiseNotesView({ vm }: Readonly<ArtiseNotesViewProps>): JSX.Element {
    const { title, chatName, state, errorText, chats, items, selectedPath, content, privacyText, labels } =
        useViewModel(vm);

    let body: JSX.Element;
    if (state === "loading") {
        body = <InlineSpinner className={styles.spinner} />;
    } else if (state === "error") {
        body = (
            <div className={styles.centered}>
                <Text role="alert">{errorText}</Text>
                <Button kind="secondary" size="md" onClick={vm.retry}>
                    {labels.retry}
                </Button>
            </div>
        );
    } else if (chats) {
        body = (
            <div className={styles.chats}>
                <Text weight="semibold">{labels.chooseChat}</Text>
                <ul className={styles.list}>
                    {chats.map((chat) => (
                        <li key={chat.id}>
                            <button type="button" className={styles.row} onClick={() => vm.chooseChat(chat.id)}>
                                <span className={styles.rowName}>{chat.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        );
    } else {
        body = (
            <div className={styles.split}>
                <nav className={styles.sidebar} aria-label={labels.tree}>
                    <ul className={styles.list}>
                        {items.map((item) => (
                            <TreeRow key={item.path} item={item} selected={item.path === selectedPath} vm={vm} />
                        ))}
                    </ul>
                    <Text size="sm" className={styles.privacy}>
                        {privacyText}
                    </Text>
                </nav>
                <main className={styles.content}>
                    <Content content={content} vm={vm} />
                </main>
            </div>
        );
    }

    return (
        <section className={styles.page} aria-label={chatName ? `${title} · ${chatName}` : title}>
            <header className={styles.header}>
                <IconButton onClick={vm.back} tooltip={labels.back} size="32px">
                    <ArrowLeftIcon />
                </IconButton>
                <Text as="h1" size="lg" weight="semibold" className={styles.title}>
                    {title}
                </Text>
                {chatName && (
                    <Text as="span" size="md" className={styles.chatName}>
                        {chatName}
                    </Text>
                )}
            </header>
            {body}
        </section>
    );
}
