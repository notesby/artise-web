#!/usr/bin/env python3
#
# Copyright 2026 Artise.
#
# SPDX-License-Identifier: AGPL-3.0-only
#
"""Tests for web_wording.py. Run from the repository root: python3 -m unittest discover -s tools/artise"""

import json
import pathlib
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import web_wording  # noqa: E402


class ProblemsTest(unittest.TestCase):
    """The checks that keep Artise's words working across Element tag merges."""

    def test_the_table_matches_elements_current_strings(self) -> None:
        # Every key exists in Element's en_EN.json, every language is filled in and placeholders match.
        element_en = web_wording._flatten(json.loads(web_wording.ELEMENT_EN.read_text(encoding="utf-8")))
        self.assertEqual(web_wording.problems(element_en), [])

    def test_a_key_renamed_upstream_is_reported(self) -> None:
        with mock.patch.dict(web_wording.WORDING, {"action|sign_out": ("Sign out", "Cerrar sesión", "Sair")}, clear=True):
            self.assertEqual(
                web_wording.problems({}),
                ["action|sign_out: no longer in Element's en_EN.json (renamed upstream?)"],
            )

    def test_a_lost_placeholder_is_reported_for_that_language(self) -> None:
        table = {"room|intro|user_created": ("%(displayName)s created this chat.", "Alguien creó este chat.", "%(displayName)s criou esta conversa.")}
        with mock.patch.dict(web_wording.WORDING, table, clear=True):
            found = web_wording.problems({"room|intro|user_created": "%(displayName)s created this room."})
        self.assertEqual(len(found), 1)
        self.assertIn("[es]: placeholders differ", found[0])

    def test_a_lost_tag_is_reported(self) -> None:
        table = {"setting|help_about|homeserver": ("Workspace: %(homeserverUrl)s", "Espacio: <code>%(homeserverUrl)s</code>", "Espaço: <code>%(homeserverUrl)s</code>")}
        with mock.patch.dict(web_wording.WORDING, table, clear=True):
            found = web_wording.problems({"setting|help_about|homeserver": "Account provider is <code>%(homeserverUrl)s</code>"})
        self.assertEqual(len(found), 1)
        self.assertIn("[en]", found[0])

    def test_an_empty_text_is_reported(self) -> None:
        with mock.patch.dict(web_wording.WORDING, {"common|room": ("Chat", "", "Conversa")}, clear=True):
            found = web_wording.problems({"common|room": "Room"})
        self.assertEqual(found, ["common|room [es]: empty"])

    def test_a_plural_must_stay_a_plural(self) -> None:
        with mock.patch.dict(web_wording.WORDING, {"common|n_rooms": ("%(count)s chats", "%(count)s chats", "%(count)s conversas")}, clear=True):
            found = web_wording.problems({"common|n_rooms": {"one": "%(count)s room", "other": "%(count)s rooms"}})
        self.assertEqual(len(found), 3)


class OutputTest(unittest.TestCase):
    """The JSON the app loads."""

    def test_portuguese_is_written_for_pt_and_pt_br(self) -> None:
        entry = web_wording.build()["common|room"]
        self.assertEqual(entry, {"en": "Chat", "es": "Chat", "pt": "Conversa", "pt-br": "Conversa"})

    def test_the_committed_json_is_current(self) -> None:
        # Someone edited the table without running the script: the app would still show the old words.
        self.assertEqual(web_wording.OUTPUT.read_text(encoding="utf-8"), web_wording.render())


class ArtiseTextsTest(unittest.TestCase):
    """Artise's own texts, for Artise's screens."""

    def test_a_key_outside_artise_namespace_is_reported(self) -> None:
        with mock.patch.dict(web_wording.WORDING, {}, clear=True), mock.patch.dict(
            web_wording.ARTISE_TEXTS, {"settings|help": ("Help", "Ayuda", "Ajuda")}, clear=True
        ):
            found = web_wording.problems({})
        self.assertEqual(len(found), 1)
        self.assertIn("start with 'artise|'", found[0])

    def test_a_placeholder_missing_in_one_language_is_reported(self) -> None:
        texts = {"artise|settings|x": ("About %(workspace)s.", "Sobre tu espacio.", "Sobre %(workspace)s.")}
        with mock.patch.dict(web_wording.WORDING, {}, clear=True), mock.patch.dict(web_wording.ARTISE_TEXTS, texts, clear=True):
            found = web_wording.problems({})
        self.assertEqual(found, ["artise|settings|x [es]: placeholders differ from the English ['%(workspace)s']"])

    def test_artise_texts_are_in_the_json(self) -> None:
        self.assertEqual(web_wording.build()["artise|settings|help"], {"en": "Help", "es": "Ayuda", "pt": "Ajuda", "pt-br": "Ajuda"})


if __name__ == "__main__":
    unittest.main()
