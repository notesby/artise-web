# Artise desktop update feeds

What Artise for macOS reads every hour to know the newest version of its channel (Element's updater, Squirrel.Mac):

- `stable/macos/releases.json`: everyone.
- `beta/macos/releases.json`: Macs with Help → "Recibir versiones de prueba" on.

Written by CI on a `desktop-v*` tag (beta) and by the "Artise desktop: promote" workflow (stable), through
`tools/artise/desktop_feed.py` on the `development` branch. The files named inside are the GitHub release's assets.
Nothing else lives on this branch; don't merge it anywhere.
