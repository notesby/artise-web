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

| File                                                           | Why                                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/i18n/settings.ts`                                | `setLanguage` registers Artise's words (`artise/i18n/registerArtiseTranslations.ts`) after Element's texts and before the server's `custom_translations_url`. |
| `apps/web/src/stores/room-list-v3/RoomListStoreV3.ts`          | `getSortedRoomsInActiveSpace` puts Ari's chat first in its section (`artise/assistant/assistantFirst.ts`), except while a filter is on.                       |
| `apps/web/src/components/views/dialogs/UserTab.ts`             | Adds the `Artise` tab ID.                                                                                                                                     |
| `apps/web/src/components/views/dialogs/UserSettingsDialog.tsx` | Adds Artise's tab ("Ayuda y cuenta", `artise/settings/ArtiseSettingsTab.tsx`) after Help, on Artise workspaces only.                                          |
| `packages/shared-components/src/index.ts`                      | Exports Artise's views (`packages/shared-components/src/artise/`).                                                                                            |
| `apps/web/src/Notifier.ts`                                     | `evaluateEvent` applies Ari's level (`artise/notifications/automationLevel.ts`): important posts always notify, critical ones also sound.                     |

## Artise's words

Element's texts use Artise's words: chat instead of room, sign out instead of "remove this device", "espacio de
trabajo" / "espaço de trabalho" instead of the homeserver. The words are the phones'; the keys are Element Web's own.

- The table is `tools/artise/web_wording.py`. Edit it, then run `python3 tools/artise/web_wording.py`, which writes
  `apps/web/src/artise/i18n/wording.json`. Element's string files are never edited.
- The words ship inside the app: `setLanguage` registers them right after Element's texts, so they need no server
  setting and the desktop app gets them too. A workspace can still change a word through `custom_translations_url`.
- Element's own unit tests run with Element's words (their snapshots say "Rooms"); Artise's tests turn the words on
  with `setArtiseTranslationsInTests(true)`.
- Artise's own texts (for Artise's screens) are in the same table, `ARTISE_TEXTS`, with keys starting `artise|`. Code
  reads them with `artiseT("artise|…")` (`apps/web/src/artise/i18n/artiseT.ts`), which only accepts keys that exist.
  Views get their texts already translated from their view model, so shared-components' own string files stay
  Element's.
- `python3 -m unittest discover -s tools/artise` (also in CI) fails when Element renames a key in the table, a
  language is missing, a text loses a placeholder or tag, or the JSON is stale.

## The server's `config.json`

The server mounts its own `config.json` over `/app/config.json` (family-wiki `deploy/`). Besides what it has, Artise
needs these keys on every workspace:

```json
{
    "bug_report_endpoint_url": "https://reports.artise.co/api/submit",
    "sentry": { "dsn": "<the web project's DSN on crashes.artise.co>", "environment": "<workspace>" },
    "map_style_url": "<the map style the phones use>"
}
```

- Artise's words need no setting: they ship inside the app. `custom_translations_url` stays free for a
  workspace that wants to change a word for itself.
- Problem reports arrive with the app name `element-web`, which Element hard-codes (`rageshake/submit-rageshake.ts`).
  reports.artise.co must accept that name; web and desktop are told apart by the report's `platform` field.
- Sign in with a QR code needs no setting: Settings → Sessions shows "Link new device" when the workspace's server
  reports `org.matrix.msc4108` (artise.co and mas-k8s did on 2026-10-18) and the person's encryption is set up.
