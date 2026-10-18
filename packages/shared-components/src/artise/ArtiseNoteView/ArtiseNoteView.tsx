/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, type ReactNode } from "react";

import styles from "./ArtiseNoteView.module.css";
import { type ArtiseNoteBlock, type ArtiseNoteDocument, type ArtiseNoteInline, type ArtiseNoteListItem } from "./types";

export interface ArtiseNoteViewProps {
    /** The note, already read from its Markdown. */
    document: ArtiseNoteDocument;
    /** A `[[link]]` was pressed: `path` is the note or file, or `null` when it doesn't exist yet. */
    onOpenLink: (path: string | null, target: string) => void;
    /** An embedded file (not a photo) was pressed. */
    onOpenEmbed: (path: string) => void;
    /** The task boxes' label for screen readers, e.g. "Hecho". */
    taskLabel: string;
    /** A task box was pressed (its line in the note). Without it, tasks can't be ticked (a preview). */
    onToggleTask?: (line: number) => void;
}

function inline(node: ArtiseNoteInline, key: number, props: ArtiseNoteViewProps): ReactNode {
    switch (node.type) {
        case "text":
            return node.text;
        case "code":
            return (
                <code key={key} className={styles.inlineCode}>
                    {node.text}
                </code>
            );
        case "emph":
            return <em key={key}>{inlines(node.children, props)}</em>;
        case "strong":
            return <strong key={key}>{inlines(node.children, props)}</strong>;
        case "break":
            return <br key={key} />;
        case "link":
            return (
                <a key={key} href={node.href} target="_blank" rel="noreferrer noopener">
                    {inlines(node.children, props)}
                </a>
            );
        case "noteLink":
            return (
                <button
                    key={key}
                    type="button"
                    className={node.path ? styles.noteLink : styles.missingLink}
                    onClick={() => props.onOpenLink(node.path, node.target)}
                >
                    {node.text}
                </button>
            );
        case "embed":
            if (node.image && node.src) {
                return <img key={key} className={styles.image} src={node.src} alt={node.name} />;
            }
            if (node.image && node.path) {
                // Still loading: its name holds the place.
                return (
                    <span key={key} className={styles.imagePlaceholder}>
                        {node.name}
                    </span>
                );
            }
            return node.path ? (
                <button
                    key={key}
                    type="button"
                    className={styles.fileLink}
                    onClick={() => props.onOpenEmbed(node.path!)}
                >
                    {node.name}
                </button>
            ) : (
                <span key={key} className={styles.missingLink}>
                    {node.name}
                </span>
            );
    }
}

function inlines(nodes: ArtiseNoteInline[], props: ArtiseNoteViewProps): ReactNode[] {
    return nodes.map((node, i) => inline(node, i, props));
}

function listItem(item: ArtiseNoteListItem, key: number, props: ArtiseNoteViewProps): JSX.Element {
    return (
        <li key={key} className={item.checked === undefined ? undefined : styles.task}>
            {item.checked !== undefined && (
                <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={!props.onToggleTask || item.line === undefined}
                    onChange={() => item.line !== undefined && props.onToggleTask?.(item.line)}
                    aria-label={props.taskLabel}
                />
            )}
            <div>{blocks(item.children, props)}</div>
        </li>
    );
}

function block(node: ArtiseNoteBlock, key: number, props: ArtiseNoteViewProps): JSX.Element {
    switch (node.type) {
        case "paragraph":
            return <p key={key}>{inlines(node.children, props)}</p>;
        case "heading": {
            const Heading = `h${node.level}` as const;
            return <Heading key={key}>{inlines(node.children, props)}</Heading>;
        }
        case "code":
            return (
                <pre key={key} className={styles.codeBlock}>
                    <code>{node.text}</code>
                </pre>
            );
        case "quote":
            return (
                <blockquote key={key} className={styles.quote}>
                    {blocks(node.children, props)}
                </blockquote>
            );
        case "list": {
            const items = node.items.map((item, i) => listItem(item, i, props));
            return node.ordered ? (
                <ol key={key} start={node.start}>
                    {items}
                </ol>
            ) : (
                <ul key={key}>{items}</ul>
            );
        }
        case "rule":
            return <hr key={key} />;
    }
}

function blocks(nodes: ArtiseNoteBlock[], props: ArtiseNoteViewProps): JSX.Element[] {
    return nodes.map((node, i) => block(node, i, props));
}

/**
 * A note, drawn from its parts. Every part is plain React: nothing in a note becomes HTML.
 *
 * @example
 * ```tsx
 * <ArtiseNoteView document={doc} onOpenLink={open} onOpenEmbed={download} taskLabel="Hecho" />
 * ```
 */
export function ArtiseNoteView(props: Readonly<ArtiseNoteViewProps>): JSX.Element {
    return <article className={styles.note}>{blocks(props.document, props)}</article>;
}
