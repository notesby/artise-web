/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, type KeyboardEvent, useRef, useState } from "react";
import classNames from "classnames";
import { Alert, Button, Text } from "@vector-im/compound-web";

import { useViewModel } from "../../core/viewmodel";
import { ArtiseNoteView } from "../ArtiseNoteView/ArtiseNoteView";
import styles from "./ArtiseNotesView.module.css";
import { FileButton } from "./NotesFileActions";
import { type ArtiseNotesChoice, type ArtiseNotesEditor, type ArtiseNotesViewModel } from "./types";

/** The note's Markdown on the left and how it will look on the right, with `[[link]]` suggestions. */
export function NoteEditor({
    editor,
    vm,
}: Readonly<{ editor: ArtiseNotesEditor; vm: ArtiseNotesViewModel }>): JSX.Element {
    const { labels } = useViewModel(vm);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const [active, setActive] = useState(0);
    const suggestions = editor.suggestions?.items ?? [];
    const highlighted = Math.min(active, Math.max(0, suggestions.length - 1));

    const pick = (insert: string): void => {
        const box = textarea.current;
        if (!box || !editor.suggestions) return;
        const cursor = box.selectionStart;
        const draft = editor.draft.slice(0, editor.suggestions.from) + insert + editor.draft.slice(cursor);
        const after = editor.suggestions.from + insert.length;
        vm.changeDraft(draft, after);
        // Put the cursor after the inserted link once React has the new text.
        requestAnimationFrame(() => box.setSelectionRange(after, after));
        setActive(0);
    };

    const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>): void => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key === "s") {
            ev.preventDefault();
            vm.save();
            return;
        }
        if (!suggestions.length) return;
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            const step = ev.key === "ArrowDown" ? 1 : -1;
            setActive((highlighted + step + suggestions.length) % suggestions.length);
        } else if (ev.key === "Enter" || ev.key === "Tab") {
            ev.preventDefault();
            pick(suggestions[highlighted].insert);
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            vm.changeDraft(editor.draft, -1);
        }
    };

    return (
        <div className={styles.editor}>
            <div className={styles.toolbar}>
                <Text as="h2" size="lg" weight="semibold" className={styles.editorTitle}>
                    {editor.title}
                </Text>
                <FileButton kind="tertiary" label={labels.upload} onFiles={vm.attach} />
                <Button kind="secondary" size="md" onClick={vm.cancelEdit} disabled={editor.saving}>
                    {labels.cancel}
                </Button>
                <Button kind="primary" size="md" onClick={vm.save} disabled={editor.saving || !editor.dirty}>
                    {labels.save}
                </Button>
            </div>
            {editor.hint && <Alert type="info" title={editor.hint} />}
            {editor.error && <Alert type="critical" title={editor.error} />}
            <div className={styles.editorPanes}>
                <div className={styles.editorSource}>
                    <textarea
                        ref={textarea}
                        className={styles.textarea}
                        aria-label={labels.editor}
                        value={editor.draft}
                        spellCheck
                        onChange={(ev) => {
                            setActive(0);
                            vm.changeDraft(ev.target.value, ev.target.selectionStart);
                        }}
                        onKeyDown={onKeyDown}
                        aria-autocomplete="list"
                        aria-controls={suggestions.length ? "artise-notes-suggestions" : undefined}
                    />
                    {suggestions.length > 0 && (
                        <ul
                            id="artise-notes-suggestions"
                            className={styles.suggestions}
                            role="listbox"
                            aria-label={labels.suggestions}
                        >
                            {suggestions.map((item, i) => (
                                <li
                                    key={item.path}
                                    role="option"
                                    aria-selected={i === highlighted}
                                    className={classNames(styles.suggestion, {
                                        [styles.suggestionActive]: i === highlighted,
                                    })}
                                    // Keep the textarea focused: pick on mouse down, before it would blur.
                                    onMouseDown={(ev) => {
                                        ev.preventDefault();
                                        pick(item.insert);
                                    }}
                                >
                                    <span>{item.name}</span>
                                    {item.path !== `${item.name}.md` && item.path !== item.name && (
                                        <span className={styles.suggestionPath}>{item.path}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <section className={styles.editorPreview} aria-label={labels.preview}>
                    <ArtiseNoteView
                        document={editor.preview}
                        onOpenLink={() => {}}
                        onOpenEmbed={() => {}}
                        taskLabel={labels.task}
                    />
                </section>
            </div>
        </div>
    );
}

/** The same lines changed (or the note was deleted) meanwhile: both versions and what to keep. */
export function NoteChoice({
    choice,
    vm,
}: Readonly<{ choice: ArtiseNotesChoice; vm: ArtiseNotesViewModel }>): JSX.Element {
    const { labels } = useViewModel(vm);
    return (
        <div className={styles.choice}>
            <Alert type="critical" title={choice.text} />
            <div className={styles.versions}>
                <section className={styles.version} aria-label={labels.mine}>
                    <Text weight="semibold">{labels.mine}</Text>
                    <pre className={styles.versionText}>{choice.mine}</pre>
                </section>
                {choice.theirs !== undefined && (
                    <section className={styles.version} aria-label={labels.theirs}>
                        <Text weight="semibold">{labels.theirs}</Text>
                        <pre className={styles.versionText}>{choice.theirs}</pre>
                    </section>
                )}
            </div>
            <div className={styles.fileButtons}>
                {choice.kind === "conflict" ? (
                    <>
                        <Button kind="primary" size="md" onClick={vm.keepMine}>
                            {labels.keepMine}
                        </Button>
                        <Button kind="secondary" size="md" onClick={vm.keepTheirs}>
                            {labels.keepTheirs}
                        </Button>
                        <Button kind="secondary" size="md" onClick={vm.combine}>
                            {labels.combine}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button kind="primary" size="md" onClick={vm.keepCopy}>
                            {labels.keepCopy}
                        </Button>
                        <Button kind="secondary" size="md" destructive onClick={vm.discard}>
                            {labels.discard}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

/** Naming a new note, at the top of the list. */
export function NoteNaming({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element | null {
    const { naming, labels } = useViewModel(vm);
    if (!naming) return null;
    return (
        <form
            className={styles.naming}
            onSubmit={(ev) => {
                ev.preventDefault();
                vm.createNote();
            }}
        >
            <input
                className={styles.nameInput}
                aria-label={labels.name}
                placeholder={labels.name}
                value={naming.name}
                // The person just asked for a new note: start typing its name.
                autoFocus
                onChange={(ev) => vm.changeName(ev.target.value)}
                onKeyDown={(ev) => ev.key === "Escape" && vm.cancelNaming()}
                aria-invalid={!!naming.error}
                aria-describedby={naming.error ? "artise-notes-name-error" : undefined}
            />
            {naming.error && (
                <Text id="artise-notes-name-error" size="sm" className={styles.nameError}>
                    {naming.error}
                </Text>
            )}
            <div className={styles.fileButtons}>
                <Button kind="primary" size="md" type="submit" disabled={naming.saving}>
                    {labels.create}
                </Button>
                <Button kind="tertiary" size="md" type="button" onClick={vm.cancelNaming}>
                    {labels.cancel}
                </Button>
            </div>
        </form>
    );
}

/** Leaving would lose unsaved changes. */
export function LeavePrompt({ vm }: Readonly<{ vm: ArtiseNotesViewModel }>): JSX.Element | null {
    const { confirmLeave, labels } = useViewModel(vm);
    if (!confirmLeave) return null;
    return (
        <div className={styles.leave} role="alertdialog" aria-label={confirmLeave.text}>
            <Text>{confirmLeave.text}</Text>
            <div className={styles.fileButtons}>
                <Button kind="primary" size="md" onClick={vm.keepEditing}>
                    {labels.keepEditing}
                </Button>
                <Button kind="secondary" size="md" destructive onClick={vm.leaveWithoutSaving}>
                    {labels.leave}
                </Button>
            </div>
        </div>
    );
}
