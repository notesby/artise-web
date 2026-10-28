# Artise desktop: the hand checklist

Run before every beta and stable release, on a real Windows 11 PC and a real Mac with Apple silicon (about an hour
each). CI already checks each build starts, opens two workspaces apart and switches between them
(`playwright/e2e/artise/`); this is what only a person on the real machine can see. Write the result in the
release's PR: each line ✅, or ❌ with what happened.

Use a test account on mas-k8s, and a second workspace you belong to. Do one run with the computer in English
and one in Portuguese; the main run in Spanish.

## Install

- [ ] Windows: install from the Microsoft Store (beta: the private listing). Artise opens; the Start menu, the
      taskbar and Task Manager say "Artise" with Artise's icon.
- [ ] macOS: open the `.dmg`, drag Artise to Applications, open it: a signed build opens at once (a test build
      made without the signing secrets needs right-click → Open the first time). The Dock and the menu bar say
      "Artise".
- [ ] Help → "Acerca de Artise" shows the version, the AGPL licence and "Código fuente", which opens this
      release's tag on GitHub.

## Signing in

- [ ] Welcome: "Continuar con Apple / Google / Microsoft / correo". Each opens Artise ID in the browser, and the
      browser comes back to Artise by itself (try all four across the runs).
- [ ] "Volver" while the browser is open goes back to the welcome.
- [ ] "Elige tus espacios de trabajo" lists both workspaces, both ticked; "Abrir" opens them and the first one's
      sign-in (MAS) opens in the browser with no typing; after it, the chats show.
- [ ] Sign in to the second workspace from its view the same way.
- [ ] Quit and open Artise again: both workspaces open straight away, still signed in.

## Two workspaces

- [ ] The rail shows both (logo or initials); a click and Ctrl/⌘+1, Ctrl/⌘+2 switch at once.
- [ ] A message to the hidden workspace from another device: the rail count goes up, the badge (Dock on
      macOS, taskbar on Windows) shows the total of both, and a notification says "<workspace> · <sender>".
- [ ] Clicking that notification shows that workspace and that chat.
- [ ] The tray menu (Windows) lists both with their counts; choosing one shows it.
- [ ] Ari's chat is first in each chat list.

## In the background

- [ ] Close the window (Windows): Artise stays in the tray, and messages still notify.
- [ ] Restart the computer: Artise starts by itself (Windows Store: from the StartupTask; macOS: hidden, from
      the login item), and messages notify without opening the window.

## Calls and files

- [ ] A video call with someone on a phone: macOS asks for the camera and the microphone in the computer's
      language ("Artise usa la cámara para las videollamadas.").
- [ ] Share the screen in the call. On macOS the first time, allow Artise in System Settings → Privacy &
      Security → Screen Recording, then share again.
- [ ] Drag a file from the desktop onto Ari's chat: it sends.
- [ ] Notes: open a chat's notes, edit one, save.
- [ ] Search in an encrypted chat finds an old message (Seshat).

## Settings

- [ ] Help → "Compartir informes de fallos" is off unless you said yes at the first start; turning it on and off
      sticks after a restart.
- [ ] Settings → Sessions → "Link new device" shows a QR code; a phone scanning it signs in (when the workspace
      offers it).
- [ ] Settings → General → Language: change it; the app and the menus follow; restart keeps it.

## Leaving

- [ ] Sign out of one workspace ("Cerrar sesión en {espacio}"): it leaves the rail; the other stays.
- [ ] "+" on the rail lists it again; open it, sign in again.
- [ ] Sign out of both: the welcome shows, and Artise ID is signed out in the browser too.
- [ ] After that, Artise's folder (`%APPDATA%\Artise`, `~/Library/Application Support/Artise`) has no
      `workspaces/` and no `Partitions/workspace-*` folders after one more start.

## Updates (once update feeds exist, D4-3)

- [ ] macOS: installing the previous beta, then this one arrives by itself and keeps the sign-ins.
- [ ] Windows: the Store updates it.

## The release note

Every user-visible desktop release gets a what's-new note in en, es and pt. The first one:

- en: "Artise for Windows and Mac: all your workspaces in one window, notifications from each of them, calls and
  screen sharing."
- es: "Artise para Windows y Mac: todos tus espacios de trabajo en una ventana, las notificaciones de cada uno,
  llamadas y compartir pantalla."
- pt: "Artise para Windows e Mac: todos os seus espaços de trabalho em uma janela, as notificações de cada um,
  chamadas e compartilhamento de tela."
