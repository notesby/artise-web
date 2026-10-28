#!/usr/bin/env python3
# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
"""The desktop app's update feeds: what Element's updater reads on macOS, by channel.

A release `desktop-v1.2.3` is a GitHub release (its .dmg, .zip and the feed file as assets) and a line in the
`desktop-feeds` branch: `<channel>/macos/releases.json`, the one small file the app fetches every hour from
raw.githubusercontent.com (config.json's `update_base_url`). The files themselves are served by GitHub's releases,
so the feed costs nothing to host and nothing to download.

    desktop_feed.py releases-json --version 1.2.3 --url <the -mac.zip asset> --notes-file <note.md>   # prints the feed
    desktop_feed.py publish --channel beta releases.json      # writes it to the branch (CI, on a release tag)
    desktop_feed.py promote --version 1.2.3                   # copies beta's feed to stable (the promote workflow)

CI publishes to beta first; moving a release to stable is the hand-started "Artise desktop: promote" workflow, which
copies the file and marks the GitHub release as the latest. Nothing is rebuilt.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import subprocess
import sys

REPO = "notesby/artise-web"
BRANCH = "desktop-feeds"
CHANNELS = ("stable", "beta")


def feed_path(channel: str) -> str:
    """Where the app looks, under config.json's update_base_url (src/updater.ts adds macos/releases.json)."""
    if channel not in CHANNELS:
        raise ValueError(f"channel is one of {CHANNELS}, not {channel!r}")
    return f"{channel}/macos/releases.json"


def asset_url(repo: str, tag: str, filename: str) -> str:
    """A GitHub release asset's download address; spaces encoded, as Squirrel.Mac wants a clean URL."""
    return f"https://github.com/{repo}/releases/download/{tag}/{filename.replace(' ', '%20')}"


def releases_json(version: str, url: str, notes: str = "", date: dt.datetime | None = None) -> dict:
    """The feed Squirrel.Mac reads (Electron's autoUpdater, serverType json): one release, the newest."""
    when = (date or dt.datetime.now(dt.timezone.utc)).astimezone(dt.timezone.utc).replace(microsecond=0)
    return {
        "currentRelease": version,
        "releases": [
            {
                "version": version,
                "updateTo": {
                    "version": version,
                    "name": f"Artise {version}",
                    "notes": notes.strip(),
                    "pub_date": when.isoformat().replace("+00:00", "Z"),
                    "url": url,
                },
            }
        ],
    }


def check_feed(feed: dict, version: str) -> None:
    """ValueError unless the feed is for this version and points at a GitHub release asset."""
    if feed.get("currentRelease") != version:
        raise ValueError(f"the feed is for {feed.get('currentRelease')!r}, not {version}")
    releases = feed.get("releases") or []
    urls = [r.get("updateTo", {}).get("url", "") for r in releases if isinstance(r, dict)]
    if not urls or not all(u.startswith("https://github.com/") and u.endswith("-mac.zip") for u in urls):
        raise ValueError("the feed must point at the release's -mac.zip on GitHub")


# --- GitHub (the contents API, through gh) ------------------------------------------------------------------


def gh_api(args: list[str], stdin: str | None = None) -> tuple[int, str]:
    done = subprocess.run(["gh", "api", *args], input=stdin, capture_output=True, text=True)
    return done.returncode, done.stdout if done.returncode == 0 else done.stderr


def read_file(repo: str, path: str) -> tuple[str | None, str]:
    """(the file's sha, its text) on the feeds branch; (None, "") when it isn't there yet."""
    code, out = gh_api([f"repos/{repo}/contents/{path}?ref={BRANCH}"])
    if code != 0:
        if "404" in out or "Not Found" in out:
            return None, ""
        raise SystemExit(f"!! GitHub: {out.strip()[-500:]}")
    answer = json.loads(out)
    return answer["sha"], base64.b64decode(answer["content"]).decode()


def write_file(repo: str, path: str, text: str, message: str) -> None:
    sha, _ = read_file(repo, path)
    body = {"branch": BRANCH, "message": message, "content": base64.b64encode(text.encode()).decode()}
    if sha:
        body["sha"] = sha
    code, out = gh_api(["-X", "PUT", f"repos/{repo}/contents/{path}", "--input", "-"], json.dumps(body))
    if code != 0:
        raise SystemExit(f"!! GitHub: {out.strip()[-500:]}")
    print(f"wrote {path} on {BRANCH}")


# --- the commands --------------------------------------------------------------------------------------------


def cmd_releases_json(args: argparse.Namespace) -> int:
    notes = open(args.notes_file, encoding="utf-8").read() if args.notes_file else ""
    print(json.dumps(releases_json(args.version, args.url, notes), indent=2))
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    text = open(args.file, encoding="utf-8").read()
    feed = json.loads(text)
    version = feed.get("currentRelease", "?")
    check_feed(feed, version)
    write_file(args.repo, feed_path(args.channel), text, f"desktop {version} on {args.channel}")
    return 0


def cmd_promote(args: argparse.Namespace) -> int:
    _, text = read_file(args.repo, feed_path("beta"))
    if not text:
        raise SystemExit("!! beta has no feed yet")
    check_feed(json.loads(text), args.version)
    write_file(args.repo, feed_path("stable"), text, f"desktop {args.version} on stable")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default=REPO)
    commands = parser.add_subparsers(dest="command", required=True)
    feed = commands.add_parser("releases-json", help="print the feed for one release")
    feed.add_argument("--version", required=True)
    feed.add_argument("--url", required=True, help="the release's -mac.zip asset")
    feed.add_argument("--notes-file", help="the what's-new note (markdown)")
    publish = commands.add_parser("publish", help="write a feed file to a channel on the feeds branch")
    publish.add_argument("--channel", required=True, choices=CHANNELS)
    publish.add_argument("file")
    promote = commands.add_parser("promote", help="copy beta's feed to stable")
    promote.add_argument("--version", required=True, help="the version beta must be on")
    args = parser.parse_args(argv)
    return {"releases-json": cmd_releases_json, "publish": cmd_publish, "promote": cmd_promote}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
