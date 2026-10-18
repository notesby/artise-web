# Artise for the web

A branded fork of [Element Web](https://github.com/element-hq/element-web) (AGPL-3.0), served at
chat.artise.co. The Android app is the same idea: [artise-android](https://github.com/notesby/artise-android).

## Branches

- `development`: Artise, deployable. Work happens on `feature/*` branches merged into it.
- `upstream` remote: element-hq/element-web. Element releases are merged in by tag
  (`git fetch upstream --tags && git merge v1.12.31`); Artise changes stay small and in clearly named places so
  those merges stay easy.

## Building and deploying

- `.github/workflows/artise-build.yml` builds `apps/web/Dockerfile` on every push to `development` and publishes
  `ghcr.io/notesby/artise-web:development` and `:sha-<commit>`. Element's own workflows are disabled in the
  repository settings (they'd run their whole CI on every push).
- The server (family-wiki `deploy/docker-compose.yml`) pins the image by digest, like every other image there, and
  mounts its own `config.json` over `/app/config.json`.
- Locally: `corepack enable --install-directory ~/.local/bin pnpm`, then `pnpm install` and
  `cd apps/web && pnpm start`. See AGENTS.md for tests and linting.
- `.github/workflows/artise-checks.yml` runs on every pull request into `development`: Artise's file headers, the
  type check and the unit tests in Artise's folders. Before merging an Element tag, run Element's whole suite
  locally (`pnpm lint` and `pnpm test:unit`).

## Where Artise code lives

Artise code goes in its own folders, which Element never touches, so tag merges stay easy. The iOS app works the
same way (artise-ios `Artise/README.md`).

| Folder                                   | Holds                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/artise/`                   | Logic and view models: the workspace file, Notes, notifications, wording, the desktop bridge. Tests sit next to each file (`*.test.ts`, vitest). |
| `packages/shared-components/src/artise/` | Artise's views (MVVM, as AGENTS.md describes), with Storybook stories.                                                                           |
| `apps/desktop/src/artise/`               | The desktop shell: Artise ID, the workspace rail, one view per workspace.                                                                        |
| `tools/artise/`                          | Scripts: the file header check, the wording table import.                                                                                        |

Every file Artise adds starts with:

```
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
```

`tools/artise/check-headers.sh` checks this in CI.

Artise reads its workspace's file (`co.artise.workspace` in `/.well-known/matrix/client`) through
`apps/web/src/artise/workspace/WorkspaceFile.ts`. Every field is optional, because workspaces are updated one at
a time.

### Element files changed

Element's own files change only where Artise needs a hook. Each hook is one call into `artise/`, marked with an
`// Artise:` comment, and listed here. When a merge conflicts at a hook, move the call; the logic stays in
`artise/`.

| File                         | Why                                                                   |
| ---------------------------- | --------------------------------------------------------------------- |
| `apps/web/webpack.config.ts` | Copies `res/artise/` into the app, for Artise's wording file (below). |

## Artise's words

Element's texts use Artise's words: chat instead of room, sign out instead of "remove this device", "espacio de
trabajo" / "espaço de trabalho" instead of the homeserver. The words are the phones'; the keys are Element Web's own.

- The table is `tools/artise/web_wording.py`. Edit it, then run `python3 tools/artise/web_wording.py`, which writes
  `apps/web/res/artise/translations.json`. Element's string files are never edited.
- The server's `config.json` loads the file: `"custom_translations_url": "/artise/translations.json"`.
- `python3 -m unittest discover -s tools/artise` (also in CI) fails when Element renames a key in the table, a
  language is missing, a text loses a placeholder or tag, or the JSON is stale.
