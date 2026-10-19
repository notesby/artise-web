#!/usr/bin/env python3
#
# Copyright 2026 Artise.
#
# SPDX-License-Identifier: AGPL-3.0-only
#
"""Tests for the desktop's CI scripts (apps/desktop/artise/scripts). Run from the repository root:
python3 -m unittest discover -s tools/artise"""

import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
VERSION_SH = ROOT / "apps/desktop/artise/scripts/version.sh"


def version(ref: str, run: str = "42") -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(VERSION_SH), ref, run], capture_output=True, text=True)


class VersionTest(unittest.TestCase):
    """The version a CI run builds."""

    def test_a_release_tag_gives_its_version(self) -> None:
        result = version("desktop-v1.2.3")
        self.assertEqual((result.returncode, result.stdout), (0, "1.2.3\n"))

    def test_any_other_run_is_a_numbered_test_build(self) -> None:
        # A branch or a hand-started run: never Element's package.json version.
        result = version("feature/desktop-ci", "7")
        self.assertEqual((result.returncode, result.stdout), (0, "0.0.1-dev.7\n"))

    def test_a_malformed_release_tag_fails_the_run(self) -> None:
        # desktop-v1.2 would otherwise build as a test version and look like a release.
        result = version("desktop-v1.2")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("desktop-v<major>.<minor>.<patch>", result.stderr)


if __name__ == "__main__":
    unittest.main()
