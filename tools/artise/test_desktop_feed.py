# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
"""desktop_feed.py: the feed itself, without GitHub."""

from __future__ import annotations

import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import desktop_feed  # noqa: E402

ZIP = "https://github.com/notesby/artise-web/releases/download/desktop-v1.0.0/Artise-1.0.0-universal-mac.zip"


class Feed(unittest.TestCase):
    def test_the_feed_is_what_squirrel_mac_reads(self) -> None:
        when = dt.datetime(2026, 11, 2, 15, 30, tzinfo=dt.timezone.utc)
        feed = desktop_feed.releases_json("1.0.0", ZIP, "Artise for Windows and Mac.\n", when)
        self.assertEqual(feed["currentRelease"], "1.0.0")
        self.assertEqual(feed["releases"][0]["version"], "1.0.0")
        self.assertEqual(
            feed["releases"][0]["updateTo"],
            {"version": "1.0.0", "name": "Artise 1.0.0", "notes": "Artise for Windows and Mac.",
             "pub_date": "2026-11-02T15:30:00Z", "url": ZIP},
        )

    def test_the_asset_url_is_the_release_download_with_spaces_encoded(self) -> None:
        self.assertEqual(desktop_feed.asset_url("notesby/artise-web", "desktop-v1.0.0", "Artise-1.0.0-universal-mac.zip"), ZIP)
        self.assertIn("Artise%201.0.0", desktop_feed.asset_url("notesby/artise-web", "desktop-v1.0.0", "Artise 1.0.0-mac.zip"))

    def test_each_channel_has_its_own_path_where_the_app_looks(self) -> None:
        self.assertEqual(desktop_feed.feed_path("beta"), "beta/macos/releases.json")
        self.assertEqual(desktop_feed.feed_path("stable"), "stable/macos/releases.json")
        with self.assertRaises(ValueError):
            desktop_feed.feed_path("nightly")

    def test_a_feed_is_checked_before_it_is_published_or_promoted(self) -> None:
        good = desktop_feed.releases_json("1.0.0", ZIP)
        desktop_feed.check_feed(good, "1.0.0")
        with self.assertRaises(ValueError):
            desktop_feed.check_feed(good, "1.0.1")
        with self.assertRaises(ValueError):
            desktop_feed.check_feed(desktop_feed.releases_json("1.0.0", "https://evil.example/x-mac.zip"), "1.0.0")
        with self.assertRaises(ValueError):
            desktop_feed.check_feed({"currentRelease": "1.0.0", "releases": []}, "1.0.0")


if __name__ == "__main__":
    unittest.main()
