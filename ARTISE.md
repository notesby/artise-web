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

| File                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/i18n/settings.ts`                                       | `setLanguage` registers Artise's words (`artise/i18n/registerArtiseTranslations.ts`) after Element's texts and before the server's `custom_translations_url`.                                                                                                                                                                                                                                                            |
| `apps/web/src/stores/room-list-v3/RoomListStoreV3.ts`                 | `getSortedRoomsInActiveSpace` puts Ari's chat first in its section (`artise/assistant/assistantFirst.ts`), except while a filter is on.                                                                                                                                                                                                                                                                                  |
| `apps/web/src/components/views/dialogs/UserTab.ts`                    | Adds the `Artise` tab ID.                                                                                                                                                                                                                                                                                                                                                                                                |
| `apps/web/src/components/views/dialogs/UserSettingsDialog.tsx`        | Adds Artise's tab ("Ayuda y cuenta", `artise/settings/ArtiseSettingsTab.tsx`) after Help, on Artise workspaces only.                                                                                                                                                                                                                                                                                                     |
| `packages/shared-components/src/index.ts`                             | Exports Artise's views (`packages/shared-components/src/artise/`).                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/Notifier.ts`                                            | `evaluateEvent` applies Ari's level (`artise/notifications/automationLevel.ts`): important posts always notify, critical ones also sound.                                                                                                                                                                                                                                                                                |
| `apps/web/src/components/views/rooms/RoomListPanel/RoomListPanel.tsx` | Draws Artise's top of the chat list (`artise/chatList/ChatListTop.tsx`): the workspace bar (name, menu of the person's other workspaces, browser only) and "What's new".                                                                                                                                                                                                                                                 |
| `apps/web/src/components/views/dialogs/LogoutDialog.tsx`              | The sign-out confirmation names the workspace (`artise/signOut/signOutTexts.ts`): "¿Cerrar sesión en {espacio}?" and what it does in this browser or on this computer.                                                                                                                                                                                                                                                   |
| `apps/web/src/vector/init.tsx`                                        | `loadPlugins` registers Artise's pages and buttons with Element's module API (`artise/module/registerArtise.tsx`): the Notes page at `#/notes` and its chat-header button.                                                                                                                                                                                                                                               |
| `apps/desktop/src/protocol.ts`                                        | The Artise build registers and answers only `co.artise.desktop:`, never Element's legacy `element://` (`artise/variant.ts`). Links Artise handles go to `artise/links.ts` first: Artise ID's sign-in returns to the shell, each workspace's to its own view.                                                                                                                                                             |
| `apps/desktop/src/electron-main.ts`                                   | Calls into `artise/main.ts`: before the app is ready, the start-up language (`artise/language.ts`); in `configureSentry`, crash reports only with consent (`artise/crashReports.ts`); the shell's `artise-shell:` scheme in Element's privileged-scheme list; the updater's base URL by channel, only on macOS (`artise/updates.ts`); and the shell, not Element, decides what the window first shows (`artise/shell/`). |
| `apps/desktop/src/seshat.ts`                                          | Message search keeps each workspace's index in its own folder (`artise/views/context.ts`).                                                                                                                                                                                                                                                                                                                               |
| `apps/desktop/src/tray.ts`                                            | The tray menu lists the open workspaces with their unread counts, above Element's items (`artise/trayItems.ts`).                                                                                                                                                                                                                                                                                                         |
| `apps/desktop/src/vectormenu.ts`                                      | The Help menu gets "Acerca de Artise": the version, the AGPL licence and this version's source code (`artise/about.ts`).                                                                                                                                                                                                                                                                                                 |
| `knip.ts`                                                             | Lists the Artise build's `apps/desktop/artise/electron-builder.ts` as an entry, so knip doesn't call it unused.                                                                                                                                                                                                                                                                                                          |

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

Opening a workspace (`src/artise/workspace/`): the shell reads its `/.well-known/matrix/client` and its
homeserver's `auth_metadata` for MAS's issuer. Element Web then gets a config (`getConfig`) for that workspace:

- its homeserver only;
- `oidc_static_clients` with the desktop's MAS client, once the workspace file lists it (`desktop_oauth`);
- `sso_redirect_options.on_welcome_page`, so a workspace without a session goes straight to its sign-in page in
  the browser.

The first workspace's language becomes the start-up language next time.

One view per workspace (`src/artise/views/`): every open workspace runs in its own view over Element's main window,
all at once (hidden ones keep syncing, `backgroundThrottling: false`), one shown; Ctrl/⌘+1…9 switches. Each view has
its own persistent partition (`persist:workspace-<key>`, the key a hash of the server name) with Artise's web app
on `vector://`, Element's preload, link handling and media auth, a permission policy (notifications, calls, screen
sharing, clipboard writing and full screen, only for `vector://vector`), its own `getConfig` and `getProtocol`
answers (the second sends its sign-in return back to it), and its own Seshat.

The rail (`src/artise/rail/`): a 72 px column on the left of the window with each open workspace's logo (or initials
on its colour) and unread count; a click or Ctrl/⌘+number shows it. Like the shell's pages it is script-free HTML on
the `artise-shell:` scheme, drawn again when something changes; logos are downloaded by the main process so the
page's policy stays `img-src 'self'`. Each workspace's web app reports its own count (`setBadgeCount`); Artise adds
them up before Element's badge code shows the total: the dock badge on macOS, and on Windows a taskbar overlay
drawn by `tools/artise/desktop_icons.py` (`artise/icons/overlay/`), since Element Web draws one per page. The tray
menu lists the workspaces with their counts.

A workspace's life:

- **Notifications** carry the workspace's name ("Casa · Ana"). An extra preload in each workspace's session
  (`views/notifications.cts`) wraps the page's `Notification`.
- **A click** on a notification shows that workspace: its web app asks for `focusWindow`, and routing knows which
  view asked.
- **Signing out of a workspace** closes it. Element Web's sign-out ends with "clear storage"; once Element's handler
  has finished, Artise:
    - takes the view away;
    - clears its partition;
    - removes its message-search folder and its secrets (pickle key, search passphrase).

    The partition's folder, which Electron keeps while running, goes at the next start (`views/cleanup.ts`).

- **The last workspace**: signing out of it also revokes Artise ID's refresh token, ends the browser session, and
  shows the welcome again.
- **"+" on the rail** lists the person's workspaces that aren't open yet.
- **Start at login** (hidden) is turned on once, the first time workspaces open, on Windows and macOS: the desktop has
  no push service, so messages arrive only while Artise runs. The person can turn it off in Settings.
- **Close-to-tray** is Element's default already.

Invite links (`src/artise/join/`): the join page's "Abrir en la computadora" opens
`co.artise.desktop://join?workspace=<slug>&code=<code>` (family-wiki `bot/joinpage.py`), the same two parts as the
phones' `https://join.artise.co/<slug>/<code>`. Artise joins as the phones do:

1. It looks the workspace up in Artise's directory (`/v1/workspaces/<slug>`).
2. A workspace that's already open is just shown.
3. Otherwise its join page (`<join_url>/<code>`, where the account is made) opens in a small window of the app. It is
   sandboxed, with no preload and an in-memory session that permits nothing; other sites open in the browser.
4. When that window closes, the workspace opens next to the others and goes to its sign-in.

Paused workspaces, expired invites, too many tries and no connection get the phones' messages. An invite that
launches Artise waits until the shell has started.

Element's main process is written for one page, so `routing.ts` lets it serve several without changing its
handlers:

- IPC from a view runs Element's handlers inside that view's context (`AsyncLocalStorage`);
- in that context `mainWindow.webContents` is the sending view (elsewhere, the shown one), so replies, spell
  check and "clear storage" reach the right workspace;
- calls about another workspace's Matrix user (pickle keys, Seshat's index) are refused;
- Seshat is loaded once per workspace (`seshat.js?workspace=<key>` is a new module, with its own index), and its
  handler is called only for that view.

Building: `.github/workflows/artise-desktop.yml` (Actions → Artise desktop → Run workflow, or a
`desktop-v<major>.<minor>.<patch>` tag) builds a macOS universal `.dmg` and `.zip` (signed and notarized when the
repository has Apple's secrets, below; unsigned otherwise) and an unsigned Windows x64 `.zip`, starts each one on its
OS (`apps/desktop/playwright/e2e/artise/`) and keeps them as the run's artifacts for 14 days. A tag `desktop-v1.2.3`
builds version 1.2.3; any other run builds `0.0.1-dev.<run number>` (`artise/scripts/version.sh`). About links the
source of the exact build: the tag, or the commit for test builds.

### Signing the Mac build (macOS)

Apple's one Developer Program covers iOS and macOS, so the account the iOS app uses also signs the Mac app: nothing
else to buy. A Mac app given out outside the Mac App Store is signed with a **Developer ID Application**
certificate (a different kind from the iOS distribution one) and **notarized**: Apple scans the build and the app
carries Apple's ticket, so macOS opens it without the right-click → Open dance, and shows its notifications.
Unsigned builds still build (for checking) and the hand checklist says how to open one.

The certificate is made from this computer, with the App Store Connect API key the iOS app already has
(`~/.artise-keys/AuthKey_<id>.p8`), by `tools/artise/mac_signing.py`:

```sh
python3 tools/artise/mac_signing.py request --issuer <App Store Connect issuer ID>   # once; the ID is kept locally
python3 tools/artise/mac_signing.py secrets                                          # sets the five secrets with gh
```

`request` makes the private key and the request in `~/.artise-keys/mac-developer-id/` (the key never leaves this
computer), asks Apple for the certificate and packs both as `developer-id.p12`, with Apple's intermediate, in the
older cipher macOS's `security import` still needs. Apple only lets the account holder make Developer ID
certificates: if `request` is refused, upload `developer-id.csr` at developer.apple.com → Certificates → Developer ID
Application, download the `.cer`, and run `mac_signing.py p12 <the .cer>`. The issuer ID is in App Store Connect →
Users and Access → Integrations → Team keys.

The repository secrets (the same names as in artise-ios, so the values are the same):

| Secret                   | Value                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| `APPLE_CSC_LINK`         | `developer-id.p12`, base64-encoded (electron-builder's `CSC_LINK`) |
| `APPLE_CSC_KEY_PASSWORD` | Its password (`~/.artise-keys/mac-developer-id/p12-password`)      |
| `ASC_KEY_ID`             | The App Store Connect API key id                                   |
| `ASC_ISSUER_ID`          | Its issuer ID                                                      |
| `ASC_KEY_P8`             | The `.p8` file, base64-encoded                                     |

With all five, the macOS job signs with the certificate (hardened runtime and Element's entitlements for the camera
and the microphone, `build/entitlements.mac.plist`), notarizes with the API key (`notarytool`, through
electron-builder and `@electron/notarize`), staples the ticket and checks it (`codesign --verify`, `spctl -a -t
install`, `stapler validate`). With none, the build is unsigned; with some, the job fails and names the missing
ones. The start-up check changes a fuse in its copy of the app, which breaks the signature, so it signs that copy
again ad hoc. The `.dmg` itself isn't signed (electron-builder's default: notarization is of the app inside it).

Certificates expire after five years and Apple allows five Developer ID certificates per team; `request` makes a
new one with `csr --force` first. Never commit the key, the certificate or the `.p12`.

### Releases and updates

A release is a tag, `desktop-v<major>.<minor>.<patch>`, on `development` once its what's-new note exists in
`apps/desktop/artise/releases/<version>.md` (en, es and pt; the release job stops without it). The tag's run builds,
checks and then publishes a GitHub **pre-release** with the `.dmg`, the `.zip` files and the macOS feed, and points
the **beta** channel at it. The Store package (`.appx`) isn't published: it's unsigned until the Store signs it, so
it goes to Partner Center by hand from the run's artifacts.

Two channels, as the phones' TestFlight and Play tracks:

- **beta**: the family testers, with Help → "Recibir versiones de prueba" on (the choice is kept in
  `artise-settings.json`, and switching it looks for an update at once on the new channel).
- **stable**: everyone else. A release moves there by hand, after the checklist: Actions → "Artise desktop:
  promote" → the tag. That copies beta's feed to stable and makes the GitHub release the latest, which is where
  `releases/latest` (the "Descargarla" button) points. Nothing is rebuilt.

The feeds are the one small file Element's updater fetches every hour, `<channel>/macos/releases.json` on the
`desktop-feeds` branch, read through raw.githubusercontent.com (`update_base_url` in `artise/config.json`;
`src/updater.ts` adds `macos/releases.json`). The files it names are the GitHub release's assets, so hosting costs
nothing and downloads don't count against a bucket. `tools/artise/desktop_feed.py` writes and promotes them with the
contents API; moving the feeds to chat.artise.co later is one URL in `config.json` and one upload step.

Only macOS updates itself (Squirrel.Mac, through Element's updater): `artise/updates.ts` gives
`electron-main.ts` the chosen channel's feed on macOS and nothing elsewhere. Windows is updated by the Microsoft
Store; there's no Linux build.

"Actualiza Artise": when a workspace file's `min_app_version.desktop` (or `/v1/sign-in`'s) is newer than this
build, Artise says which workspace needs which version once per start, with "Buscar la actualización" on macOS or
"Descargarla" (the latest release's page) elsewhere. The workspaces still open: it's the phones' notice, not a lock.
Test builds (`0.0.1-dev.<run>`) are never outdated. Today's servers send `min_app_version: {}`; the server adds
`desktop` when a release stops supporting older desktops.

### Microsoft Store (Windows)

Windows ships only through the Microsoft Store for now. The Windows job builds the Store package (`.appx`, the
`artise-windows-store` artifact):

- **Unsigned**: the Store signs it. Microsoft: "Your MSIX and AppX packages don't have to be signed with a
  certificate rooted in a trusted certificate authority when submitting to the Microsoft Store. The Microsoft Store
  will automatically re-sign your MSIX/AppX packages with a Microsoft certificate during the publishing process
  after your app passes certification."
- **Languages**: Spanish (Mexico) first, then English and Portuguese.
- **Tiles**: `artise/icons/appx/`.
- **Start at login**: through the package's `StartupTask` (`artise/appx/extensions.xml`), on by default. A packaged
  app can't use the registry key Element's `auto-launch` writes, so Artise doesn't call it in the Store build.

Its identity must match Partner Center exactly ("Values in the manifest are case-sensitive"). The owner registers the
app there, then copies the three values into the repository's variables:

```sh
gh variable set STORE_IDENTITY_NAME -R notesby/artise-web            # Package/Identity/Name
gh variable set STORE_PUBLISHER -R notesby/artise-web                # Package/Identity/Publisher, "CN=…"
gh variable set STORE_PUBLISHER_DISPLAY_NAME -R notesby/artise-web   # Package/Properties/PublisherDisplayName
```

Without them the package builds with placeholders, for checking only. Versions: the Store turns 1.2.3 into 1.2.3.0
and refuses a first part of 0, so releases start at `desktop-v1.0.0` (`artise/scripts/version.sh` checks).

The listing texts in es, en and pt, the privacy policy and support links are in `artise/store/listing.md`.

Microsoft's pages (read 2026-10-18; Microsoft's dates are shown as updated 2026-08-24 and 2026-06-17):

- [App package requirements for MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [Create an app submission (MSIX)](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [uap5:StartupTask](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-uap5-startuptask)

electron-builder's AppX options are read from its own types in the installed version 26.16.1
(`app-builder-lib/out/options/AppXOptions.d.ts`), as its web page doesn't render without JavaScript.

macOS asks before Artise first uses the camera and the microphone, in the computer's language: the texts are
`artise|desktop|mac|…` in `tools/artise/web_wording.py`, written to `artise/mac/<lang>.lproj/InfoPlist.strings`
and put in the app's Resources (English is also in Info.plist itself).

Before every beta and stable release, someone runs the hand checklist (`apps/desktop/artise/CHECKLIST.md`) on a
real Windows 11 PC and a real Mac, and writes the result in the release's PR.

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
