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

| File                                                                  | Why                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/i18n/settings.ts`                                       | `setLanguage` registers Artise's words (`artise/i18n/registerArtiseTranslations.ts`) after Element's texts and before the server's `custom_translations_url`.                                                                                                                                                                                    |
| `apps/web/src/stores/room-list-v3/RoomListStoreV3.ts`                 | `getSortedRoomsInActiveSpace` puts Ari's chat first in its section (`artise/assistant/assistantFirst.ts`), except while a filter is on.                                                                                                                                                                                                          |
| `apps/web/src/components/views/dialogs/UserTab.ts`                    | Adds the `Artise` tab ID.                                                                                                                                                                                                                                                                                                                        |
| `apps/web/src/components/views/dialogs/UserSettingsDialog.tsx`        | Adds Artise's tab ("Ayuda y cuenta", `artise/settings/ArtiseSettingsTab.tsx`) after Help, on Artise workspaces only.                                                                                                                                                                                                                             |
| `packages/shared-components/src/index.ts`                             | Exports Artise's views (`packages/shared-components/src/artise/`).                                                                                                                                                                                                                                                                               |
| `apps/web/src/Notifier.ts`                                            | `evaluateEvent` applies Ari's level (`artise/notifications/automationLevel.ts`): important posts always notify, critical ones also sound.                                                                                                                                                                                                        |
| `apps/web/src/components/views/rooms/RoomListPanel/RoomListPanel.tsx` | Draws Artise's top of the chat list (`artise/chatList/ChatListTop.tsx`): the workspace bar (name, menu of the person's other workspaces, browser only) and "What's new".                                                                                                                                                                         |
| `apps/web/src/components/views/dialogs/LogoutDialog.tsx`              | The sign-out confirmation names the workspace (`artise/signOut/signOutTexts.ts`): "¿Cerrar sesión en {espacio}?" and what it does in this browser or on this computer.                                                                                                                                                                           |
| `apps/web/src/vector/init.tsx`                                        | `loadPlugins` registers Artise's pages and buttons with Element's module API (`artise/module/registerArtise.tsx`): the Notes page at `#/notes` and its chat-header button.                                                                                                                                                                       |
| `apps/desktop/src/protocol.ts`                                        | The Artise build registers and answers only `co.artise.desktop:`, never Element's legacy `element://` (`artise/variant.ts`). Artise ID's sign-in returns go to the shell, never to Element Web (`artise/artiseId/`).                                                                                                                             |
| `apps/desktop/src/electron-main.ts`                                   | Calls into `artise/main.ts`: before the app is ready, the start-up language (`artise/language.ts`); in `configureSentry`, crash reports only with consent (`artise/crashReports.ts`); the shell's `artise-shell:` scheme in Element's privileged-scheme list; and the shell, not Element, decides what the window first shows (`artise/shell/`). |
| `apps/desktop/src/vectormenu.ts`                                      | The Help menu gets "Acerca de Artise": the version, the AGPL licence and this version's source code (`artise/about.ts`).                                                                                                                                                                                                                         |
| `knip.ts`                                                             | Lists the Artise build's `apps/desktop/artise/electron-builder.ts` as an entry, so knip doesn't call it unused.                                                                                                                                                                                                                                  |

## The desktop app

Artise for Windows and macOS is Element Desktop (`apps/desktop`) built as an Artise variant. Element's own variants
(`element.io/`) stay as they are; Artise's sit next to them in `apps/desktop/artise/`:

| File                         | Holds                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `artise/build.json`          | The variant: app ID and sign-in scheme `co.artise.desktop`, name `artise-desktop`, product name Artise.      |
| `artise/config.json`         | The config packaged with the app: brand, help link, the workspace it opens (mas-k8s until the shell).        |
| `artise/icons/`              | Icons, written by `python3 tools/artise/desktop_icons.py` from `apps/web/res/vector-icons/1024.png`.         |
| `artise/electron-builder.ts` | The Artise build: Element's `electron-builder.ts` plus `src/artise/build/builderConfig.ts` (icons, licence). |

Only the Artise build (app ID `co.artise.desktop`) behaves differently (`src/artise/variant.ts`), so Element's own
desktop tests keep passing as upstream. Its own texts are `DESKTOP_TEXTS` in `tools/artise/web_wording.py`, which
writes `apps/desktop/src/artise/i18n/wording.ts`; code reads them with `artiseT` (`src/artise/i18n/artiseT.ts`).

The desktop app packages this commit's `apps/web`, never Element's release tarball, so it runs the same Artise
code as chat.<workspace>: `apps/desktop/artise/scripts/package-webapp.sh` builds the web app, adds
`artise/config.json` and writes `webapp.asar`.

Crash reports and language (the Artise build only):

- Crash reports (the main process's errors and native crashes, as minidumps) go to the desktop project on
  crashes.artise.co, and only once the person agrees. Its DSN isn't in the repository: CI adds the
  `DESKTOP_SENTRY_DSN` secret to the packaged config.json (`ARTISE_DESKTOP_SENTRY_DSN` for
  `package-webapp.sh`); a build without it sends nothing and doesn't ask. The first start asks
  over the window, in the phones' words; Help → "Compartir informes de fallos" changes it, and turning it off
  stops them at once. The answer is kept in `artise-settings.json` in the profile. Element Desktop instead sends
  them whenever config.json has a DSN. Problem reports the person writes and sends themselves go to
  `reports.artise.co` as on the web, with the app name `element-web` (Element hard-codes it).
- Language: the person's choice in Settings comes first (Element Web keeps it). Otherwise the system's, if it is
  English or Portuguese, else the workspace's language, which is Spanish today (`es-MX`).
  `artise/language.ts` sets Chromium's language before the app is ready (`--lang`, and `LANGUAGE` on Linux, where
  Chromium ignores `--lang`); Element Web reads it as the browser's language.

Artise ID (`src/artise/artiseId/`, main process only): sign-in opens Artise ID in the person's own browser
(authorization code with PKCE S256, the desktop's own client from `/v1/sign-in`'s `desktop_client_id`, Google,
Microsoft or Apple opened directly with Zitadel's `urn:zitadel:iam:org:idp:id:` scope as on the phones). Artise ID
returns to `co.artise.desktop:/vector/webapp/` with a state starting `artise-id.`, which tells it apart from a
workspace's return to Element Web. The access token lives only in memory; the refresh token is kept in the OS key
store through Element's `Store` (Keychain / DPAPI). Refreshes go through one lock, a rotated refresh token is saved
before the new access token is used, `invalid_grant` signs the person out, and signing out revokes the refresh token
(and, for the last workspace, signs out in the browser too). Desktop sign-in shows as unavailable until
`/v1/sign-in` has `desktop_client_id`.

The shell's first screens (`src/artise/shell/`): "Continuar con Apple / Google / Microsoft / correo" (Artise ID),
then the person's workspaces as a ticked list ("Elige tus espacios de trabajo"), all ticked the first time. The
chosen ones are remembered (`openWorkspaces` in `artise-settings.json`) and opened straight away at the next start
while the person is still signed in. The screens are HTML drawn in the main process (`render.ts`) and served on the
`artise-shell:` scheme in a view over the window, with its own in-memory session, no preload, JavaScript off and a
CSP with `script-src 'none'`: every button is a link or a form the main process answers (`Shell.ts`). Texts are
`artise|desktop|welcome|…` and `artise|desktop|workspaces|…` in `tools/artise/web_wording.py`, the phones' words.

Building: `.github/workflows/artise-desktop.yml` (Actions → Artise desktop → Run workflow, or a
`desktop-v<major>.<minor>.<patch>` tag) builds an unsigned macOS universal `.dmg` and `.zip` and an unsigned Windows
x64 `.zip`, starts each one on its OS (`apps/desktop/playwright/e2e/artise/`) and keeps them as the run's artifacts
for 14 days. A tag `desktop-v1.2.3` builds version 1.2.3; any other run builds `0.0.1-dev.<run number>`
(`artise/scripts/version.sh`). About links the source of the exact build: the tag, or the commit for test builds.

Running it locally, from `apps/desktop`:

```sh
CI_PACKAGE=1 artise/scripts/package-webapp.sh   # CI_PACKAGE skips minifying, which needs more memory than most laptops have
pnpm start -- --config artise/config.json --profile artise
```

`pnpm start` runs Electron unpackaged, with Element's app ID, so the Artise-only parts (About, the scheme) show
only in a build. A Linux build to try them: `pnpm exec tsc && node scripts/copy-res.ts && pnpm exec electron-builder
--config artise/electron-builder.ts --linux dir`, then `dist/linux-unpacked/artise-desktop`.

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
