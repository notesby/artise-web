/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { Button, InlineSpinner, Text } from "@vector-im/compound-web";
import SearchIcon from "@vector-im/compound-design-tokens/assets/web/icons/search";

import { useViewModel } from "../../core/viewmodel";
import { ArtiseNoteView } from "../ArtiseNoteView/ArtiseNoteView";
import styles from "./ArtiseNotesView.module.css";
import { type ArtiseNotesHistory, type ArtiseNotesViewModel } from "./types";

/** The open note's versions; picking one shows it, with "Restaurar esta versión". */
export function NoteHistory({
    history,
    vm,
}: Readonly<{ history: ArtiseNotesHistory; vm: ArtiseNotesViewModel }>): JSX.Element {
    const { labels } = useViewModel(vm);
    let body: JSX.Element;
    if (history.state === "loading") {
        body = <InlineSpinner className={styles.spinner} />;
    } else if (history.state === "error") {
        body = (
            <Text role="alert" className={styles.message}>
                {history.errorText}
            </Text>
        );
    } else if (history.viewing) {
        body = (
            <div className={styles.version}>
                <Text size="sm" className={styles.message}>
                    {history.viewing.caption}
                </Text>
                <div className={styles.fileButtons}>
                    <Button kind="primary" size="md" onClick={vm.restoreVersion}>
                        {labels.restore}
                    </Button>
                </div>
                <div className={styles.editorPreview}>
                    <ArtiseNoteView
                        document={history.viewing.document}
                        onOpenLink={() => {}}
                        onOpenEmbed={() => {}}
                        taskLabel={labels.task}
                    />
                </div>
            </div>
        );
    } else if (history.items.length === 0) {
        body = <Text className={styles.message}>{history.emptyText}</Text>;
    } else {
        body = (
            <ul className={styles.list}>
                {history.items.map((item) => (
                    <li key={item.commit}>
                        <button type="button" className={styles.historyRow} onClick={() => vm.viewVersion(item.commit)}>
                            <span>{item.label}</span>
                            <span className={styles.suggestionPath}>{item.message}</span>
                        </button>
                    </li>
                ))}
            </ul>
        );
    }
    return (
        <section className={styles.history} aria-label={labels.history}>
            <div className={styles.toolbar}>
                <Text as="h2" size="lg" weight="semibold" className={styles.editorTitle}>
                    {labels.history} · {history.title}
                </Text>
                <Button kind="secondary" size="md" onClick={vm.closeHistory}>
                    {labels.backToNote}
                </Button>
            </div>
            {body}
        </section>
    );
}

/** "Enlazada desde": the notes that link to the open one, each with its line. */
export function Backlinks({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element | null {
    const { backlinks, labels } = useViewModel(vm);
    if (!backlinks?.length) return null;
    return (
        <section className={styles.backlinks} aria-label={labels.linkedFrom}>
            <Text weight="semibold">{labels.linkedFrom}</Text>
            <ul className={styles.list}>
                {backlinks.map((link) => (
                    <li key={link.path}>
                        <button type="button" className={styles.historyRow} onClick={() => vm.select(link.path)}>
                            <span>{link.name}</span>
                            <span className={styles.suggestionPath}>{link.line}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** The search box above the list. */
export function NotesSearchBox({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element {
    const { search, labels } = useViewModel(vm);
    return (
        <form className={styles.searchBox} onSubmit={(ev) => ev.preventDefault()} role="search">
            <SearchIcon className={styles.searchIcon} width="18px" height="18px" aria-hidden />
            <input
                type="search"
                className={styles.searchInput}
                placeholder={labels.search}
                aria-label={labels.search}
                value={search.query}
                onChange={(ev) => vm.changeSearch(ev.target.value)}
                onKeyDown={(ev) => ev.key === "Escape" && vm.clearSearch()}
            />
        </form>
    );
}

/** Search results in place of the list while searching. */
export function SearchResults({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element | null {
    const { search, labels, selectedPath } = useViewModel(vm);
    if (search.state === "idle") return null;
    return (
        <div className={styles.searchResults}>
            {search.state === "loading" && <InlineSpinner />}
            {search.message && (
                <Text size="sm" className={styles.message} role={search.state === "error" ? "alert" : "status"}>
                    {search.message}
                </Text>
            )}
            <ul className={styles.list}>
                {search.results.map((result) => (
                    <li key={result.path}>
                        <button
                            type="button"
                            className={styles.historyRow}
                            aria-current={result.path === selectedPath ? "page" : undefined}
                            onClick={() => vm.select(result.path)}
                        >
                            <span>{result.name}</span>
                            {result.lines.map((line) => (
                                <span key={line} className={styles.suggestionPath}>
                                    {line}
                                </span>
                            ))}
                        </button>
                    </li>
                ))}
            </ul>
            <Button kind="tertiary" size="md" onClick={vm.clearSearch}>
                {labels.clearSearch}
            </Button>
        </div>
    );
}
