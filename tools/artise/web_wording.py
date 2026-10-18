#!/usr/bin/env python3
#
# Copyright 2026 Artise.
#
# SPDX-License-Identifier: AGPL-3.0-only
#
"""Writes apps/web/src/artise/i18n/wording.json: Element Web's texts in Artise's words.

The words are the phones' (artise-android tools/artise/wording_overrides.py, artise-ios
Artise/Scripts/wording_overrides.py): chat instead of room, sign out instead of "remove this device",
"espacio de trabajo" / "espaço de trabalho" instead of the homeserver. Matrix spaces keep "espacio".
Element Web's string keys differ from Element X's, so this table has its own keys and the same words.

The app registers the file itself, right after Element's texts (apps/web/src/artise/i18n/
registerArtiseTranslations.ts), so Element's own string files are never edited and tag merges stay clean.
Run it after editing the table:

    python3 tools/artise/web_wording.py          # writes the JSON
    python3 tools/artise/web_wording.py --check  # fails if the JSON is stale or a key no longer exists

Portuguese is Brazilian, as on the phones; it is written for both `pt` and `pt-br`.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ELEMENT_EN = ROOT / "apps/web/src/i18n/strings/en_EN.json"
OUTPUT = ROOT / "apps/web/src/artise/i18n/wording.json"

# Element's language keys, as languages.json names them (lower case, "-" for "_").
LANGUAGES = ("en", "es", "pt", "pt-br")

# key: (English, Spanish, Portuguese). A plural is a dict {"one": …, "other": …} in each language.
WORDING: dict[str, tuple[object, object, object]] = {
    # Signing out (phones: "Cerrar sesión" instead of Element's "Remove this device")
    "action|sign_out": ("Sign out", "Cerrar sesión", "Sair"),
    "auth|logout_dialog|description": (
        "Are you sure you want to sign out?",
        "¿Seguro que quieres cerrar sesión?",
        "Tem certeza de que quer sair?",
    ),
    "auth|logout_dialog|skip_key_backup": (
        "Sign out anyway",
        "Cerrar sesión de todos modos",
        "Sair mesmo assim",
    ),
    "settings|sessions|sign_out": (
        "Sign out of this device",
        "Cerrar sesión en este dispositivo",
        "Sair deste dispositivo",
    ),
    "error|session_restore|clear_storage_button": (
        "Sign out and clear this browser",
        "Cerrar sesión y borrar este navegador",
        "Sair e apagar este navegador",
    ),
    "error|session_restore|clear_storage_description": (
        "Sign out and delete this browser's encryption keys?",
        "¿Cerrar sesión y borrar las claves de cifrado de este navegador?",
        "Sair e apagar as chaves de criptografia deste navegador?",
    ),
    # The workspace instead of the homeserver or "account provider"
    "setting|help_about|homeserver": (
        "Workspace: <code>%(homeserverUrl)s</code>",
        "Espacio de trabajo: <code>%(homeserverUrl)s</code>",
        "Espaço de trabalho: <code>%(homeserverUrl)s</code>",
    ),
    "voip|misconfigured_server_description": (
        "Please ask your workspace's admin (<code>%(homeserverDomain)s</code>) to set up a TURN server so calls"
        " work reliably.",
        "Pide al administrador de tu espacio de trabajo (<code>%(homeserverDomain)s</code>) que configure un"
        " servidor TURN para que las llamadas funcionen bien.",
        "Peça ao administrador do seu espaço de trabalho (<code>%(homeserverDomain)s</code>) para configurar um"
        " servidor TURN, para que as chamadas funcionem bem.",
    ),
    "terms|tac_description": (
        "To keep using %(homeserverDomain)s, please read and accept the terms and conditions.",
        "Para seguir usando %(homeserverDomain)s, lee y acepta los términos y condiciones.",
        "Para continuar usando %(homeserverDomain)s, leia e aceite os termos e condições.",
    ),
    "auth|failed_soft_logout_homeserver": (
        "Couldn't sign you in again because your workspace isn't answering. Try again in a moment.",
        "No pudimos volver a iniciar tu sesión porque tu espacio de trabajo no responde. Inténtalo de nuevo en"
        " un momento.",
        "Não foi possível entrar de novo porque seu espaço de trabalho não está respondendo. Tente de novo em"
        " instantes.",
    ),
    # Chats instead of rooms
    "common|room": ("Chat", "Chat", "Conversa"),
    "common|rooms": ("Chats", "Chats", "Conversas"),
    "common|n_rooms": (
        {"one": "%(count)s chat", "other": "%(count)s chats"},
        {"one": "%(count)s chat", "other": "%(count)s chats"},
        {"one": "%(count)s conversa", "other": "%(count)s conversas"},
    ),
    "common|orphan_rooms": ("Other chats", "Otros chats", "Outras conversas"),
    "common|private_room": ("Private chat", "Chat privado", "Conversa privada"),
    "common|public_room": ("Public chat", "Chat público", "Conversa pública"),
    "common|room_name": ("Chat name", "Nombre del chat", "Nome da conversa"),
    "common|unnamed_room": ("Unnamed chat", "Chat sin nombre", "Conversa sem nome"),
    "empty_room": ("Empty chat", "Chat vacío", "Conversa vazia"),
    "action|create_a_room": ("New group chat", "Nuevo chat de grupo", "Nova conversa em grupo"),
    "action|new_room": ("New group chat", "Nuevo chat de grupo", "Nova conversa em grupo"),
    "action|leave_room": ("Leave chat", "Salir del chat", "Sair da conversa"),
    "room_list|more_options|leave_room": ("Leave chat", "Salir del chat", "Sair da conversa"),
    "action|report_room": ("Report chat", "Reportar chat", "Denunciar conversa"),
    "create_room|action_create_room": ("Create chat", "Crear chat", "Criar conversa"),
    "create_room|title_private_room": (
        "New private group chat",
        "Nuevo chat de grupo privado",
        "Nova conversa em grupo privada",
    ),
    "create_room|error_title": (
        "Couldn't create the chat",
        "No se pudo crear el chat",
        "Não foi possível criar a conversa",
    ),
    "create_room|name_validation_required": (
        "Please enter a name for the chat",
        "Escribe un nombre para el chat",
        "Digite um nome para a conversa",
    ),
    "create_room|join_rule_invite_label": (
        "Only people invited will be able to find and join this chat.",
        "Solo las personas invitadas podrán encontrar este chat y unirse.",
        "Só as pessoas convidadas poderão encontrar e entrar nesta conversa.",
    ),
    "create_room|join_rule_change_notice": (
        "You can change this at any time in the chat's settings.",
        "Puedes cambiarlo cuando quieras en los ajustes del chat.",
        "Você pode mudar isso quando quiser nas configurações da conversa.",
    ),
    "right_panel|room_summary_card|title": ("Chat info", "Información del chat", "Informações da conversa"),
    "room|context_menu|title": ("Chat options", "Opciones del chat", "Opções da conversa"),
    "room|context_menu|forget": ("Forget chat", "Olvidar chat", "Esquecer conversa"),
    "room|context_menu|notifications_mute": ("Mute chat", "Silenciar chat", "Silenciar conversa"),
    "room|header_avatar_open_settings_label": (
        "Open chat settings",
        "Abrir los ajustes del chat",
        "Abrir as configurações da conversa",
    ),
    "room|intro|you_created": ("You created this chat.", "Creaste este chat.", "Você criou esta conversa."),
    "room|intro|user_created": (
        "%(displayName)s created this chat.",
        "%(displayName)s creó este chat.",
        "%(displayName)s criou esta conversa.",
    ),
    "room|intro|no_avatar_label": (
        "Add a photo so people can spot your chat easily.",
        "Añade una foto para que se reconozca el chat fácilmente.",
        "Adicione uma foto para que as pessoas reconheçam a conversa facilmente.",
    ),
    "room|leave_error_title": ("Couldn't leave the chat", "No se pudo salir del chat", "Não foi possível sair da conversa"),
    "leave_room_dialog|room_rejoin_warning": (
        "This chat is private. You can't come back without an invite.",
        "Este chat es privado. No podrás volver sin una invitación.",
        "Esta conversa é privada. Você não poderá voltar sem um convite.",
    ),
    "leave_room_dialog|room_leave_admin_warning": (
        "You're the only admin of this chat. If you leave, nobody will be able to change its settings.",
        "Eres la única persona administradora de este chat. Si sales, nadie podrá cambiar sus ajustes.",
        "Você é a única pessoa administradora desta conversa. Se sair, ninguém poderá mudar as configurações dela.",
    ),
    "room_settings|general|name_field_label": ("Chat name", "Nombre del chat", "Nome da conversa"),
    "room_settings|general|topic_field_label": ("Chat topic", "Tema del chat", "Assunto da conversa"),
    "room_settings|general|avatar_field_label": ("Chat photo", "Foto del chat", "Foto da conversa"),
    "room_list|list_title": ("Chat list", "Lista de chats", "Lista de conversas"),
}

# Artise's own texts, for Artise's screens: key (always "artise|…"): (English, Spanish, Portuguese).
# The words are the phones' where the phones have the same row (iOS screen_artise_*).
ARTISE_TEXTS: dict[str, tuple[str, str, str]] = {
    "artise|settings|tab": ("Help and account", "Ayuda y cuenta", "Ajuda e conta"),
    "artise|settings|help": ("Help", "Ayuda", "Ajuda"),
    "artise|settings|help_description": (
        "Guides and answers about Artise.",
        "Guías y respuestas sobre Artise.",
        "Guias e respostas sobre o Artise.",
    ),
    "artise|settings|contact_admin": (
        "Write to your workspace's admin",
        "Escribirle al administrador",
        "Escrever para o administrador",
    ),
    "artise|settings|contact_admin_description": (
        "For questions about %(workspace)s.",
        "Para dudas sobre %(workspace)s.",
        "Para dúvidas sobre %(workspace)s.",
    ),
    "artise|settings|security": ("Security", "Seguridad", "Segurança"),
    "artise|settings|security_description": (
        "Two-step verification and how you sign in to Artise ID.",
        "La verificación en dos pasos y cómo entras a tu Artise ID.",
        "A verificação em duas etapas e como você entra no seu Artise ID.",
    ),
    "artise|settings|security_manage": ("Manage in Artise ID", "Administrar en Artise ID", "Gerenciar no Artise ID"),
    "artise|settings|delete_account": ("Delete account", "Eliminar cuenta", "Excluir conta"),
    "artise|settings|delete_account_description": (
        "Delete your account in %(workspace)s and what's in it. It can't be undone.",
        "Elimina tu cuenta en %(workspace)s y lo que hay en ella. No se puede deshacer.",
        "Exclua sua conta em %(workspace)s e o que há nela. Não dá para desfazer.",
    ),
    "artise|settings|this_workspace": ("this workspace", "este espacio de trabajo", "este espaço de trabalho"),
    # The workspace bar above the chat list (W2-4).
    "artise|workspace|switch": (
        "Change workspace (now: %(workspace)s)",
        "Cambiar de espacio de trabajo (ahora: %(workspace)s)",
        "Mudar de espaço de trabalho (agora: %(workspace)s)",
    ),
    "artise|workspace|menu_title": ("Your workspaces", "Tus espacios de trabajo", "Seus espaços de trabalho"),
    # "What's new": one card above the chat list after an update (iOS ArtiseWhatsNew). Change the items with
    # WHATS_NEW_EDITION in apps/web/src/artise/whatsNew/WhatsNewViewModel.ts.
    "artise|whats_new|title": ("What's new", "Novedades", "Novidades"),
    "artise|whats_new|item_1": (
        "Ari is pinned at the top of your chats, and Settings has Help and account.",
        "Ari aparece fijo arriba en tus chats, y en Ajustes tienes Ayuda y cuenta.",
        "O Ari fica fixo no topo das suas conversas, e as Configurações têm Ajuda e conta.",
    ),
    "artise|whats_new|item_2": (
        "Your workspace's name is above your chats: open it to go to your other workspaces.",
        "El nombre de tu espacio de trabajo está arriba de tus chats: ábrelo para ir a tus otros espacios.",
        "O nome do seu espaço de trabalho fica acima das suas conversas: abra-o para ir aos seus outros espaços.",
    ),
    "artise|whats_new|item_3": (
        "Ari's important messages always notify you, even in a muted chat.",
        "Los mensajes importantes de Ari siempre te avisan, aunque el chat esté silenciado.",
        "As mensagens importantes do Ari sempre avisam você, mesmo com a conversa silenciada.",
    ),
    "artise|whats_new|done": ("Got it", "Entendido", "Entendi"),
    # Signing out, naming the workspace as the phones do (Android artise_sign_out_strings.xml), "this phone"
    # becoming this browser or, in the desktop app, this computer.
    "artise|sign_out|title": (
        "Sign out of %(workspace)s?",
        "¿Cerrar sesión en %(workspace)s?",
        "Sair de %(workspace)s?",
    ),
    "artise|sign_out|content_browser": (
        "Your chats in %(workspace)s will no longer show in this browser. You can sign back in anytime.",
        "Tus chats de %(workspace)s dejarán de verse en este navegador. Podrás volver a entrar cuando quieras.",
        "Suas conversas de %(workspace)s deixarão de aparecer neste navegador. Você pode entrar de novo quando quiser.",
    ),
    "artise|sign_out|content_browser_unnamed": (
        "Your chats will no longer show in this browser. You can sign back in anytime.",
        "Tus chats dejarán de verse en este navegador. Podrás volver a entrar cuando quieras.",
        "Suas conversas deixarão de aparecer neste navegador. Você pode entrar de novo quando quiser.",
    ),
    "artise|sign_out|content_computer": (
        "Your chats in %(workspace)s will no longer show on this computer. You can sign back in anytime.",
        "Tus chats de %(workspace)s dejarán de verse en esta computadora. Podrás volver a entrar cuando quieras.",
        "Suas conversas de %(workspace)s deixarão de aparecer neste computador. Você pode entrar de novo quando quiser.",
    ),
    "artise|sign_out|content_computer_unnamed": (
        "Your chats will no longer show on this computer. You can sign back in anytime.",
        "Tus chats dejarán de verse en esta computadora. Podrás volver a entrar cuando quieras.",
        "Suas conversas deixarão de aparecer neste computador. Você pode entrar de novo quando quiser.",
    ),
}

PLACEHOLDER = re.compile(r"%\(\w+\)s|<\w+>|</\w+>")


def _flatten(tree: dict, prefix: str = "") -> dict[str, object]:
    """Element's nested strings as `a|b|c` keys; plural objects stay whole."""
    flat: dict[str, object] = {}
    for key, value in tree.items():
        full = f"{prefix}|{key}" if prefix else key
        if isinstance(value, dict) and not ({"one", "other"} & value.keys()):
            flat.update(_flatten(value, full))
        else:
            flat[full] = value
    return flat


def _texts(value: object) -> list[str]:
    """Every string in a text or a plural."""
    return [str(v) for v in value.values()] if isinstance(value, dict) else [str(value)]


def problems(element_en: dict[str, object]) -> list[str]:
    """What's wrong with the table against Element's English strings; empty when it's fine.

    A key must still exist in Element (upstream renames it silently otherwise), every language must be
    filled in, and each text keeps the placeholders and tags Element's English has, or the app shows
    "%(count)s" or drops a link.
    """
    found: list[str] = []
    for key, texts in WORDING.items():
        if key not in element_en:
            found.append(f"{key}: no longer in Element's en_EN.json (renamed upstream?)")
            continue
        wanted = sorted(PLACEHOLDER.findall(" ".join(_texts(element_en[key]))))
        for language, text in zip(("en", "es", "pt"), texts):
            if isinstance(element_en[key], dict) != isinstance(text, dict):
                found.append(f"{key} [{language}]: plural in one place and not the other")
                continue
            if any(not t.strip() for t in _texts(text)):
                found.append(f"{key} [{language}]: empty")
            if sorted(PLACEHOLDER.findall(" ".join(_texts(text)))) != wanted:
                found.append(f"{key} [{language}]: placeholders differ from Element's {wanted}")
    for key, texts in ARTISE_TEXTS.items():
        if not key.startswith("artise|"):
            found.append(f"{key}: Artise's own texts start with 'artise|', so they never clash with Element's")
        if key in element_en:
            found.append(f"{key}: already one of Element's keys")
        wanted = sorted(PLACEHOLDER.findall(texts[0]))
        for language, text in zip(("en", "es", "pt"), texts):
            if not text.strip():
                found.append(f"{key} [{language}]: empty")
            if sorted(PLACEHOLDER.findall(text)) != wanted:
                found.append(f"{key} [{language}]: placeholders differ from the English {wanted}")
    return found


def build() -> dict[str, dict[str, object]]:
    """The custom translations file: key → language → text."""
    table: dict[str, tuple[object, object, object]] = {**WORDING, **ARTISE_TEXTS}
    return {key: {"en": en, "es": es, "pt": pt, "pt-br": pt} for key, (en, es, pt) in sorted(table.items())}


def render() -> str:
    return json.dumps(build(), ensure_ascii=False, indent=4) + "\n"


def main(argv: list[str]) -> int:
    element_en = _flatten(json.loads(ELEMENT_EN.read_text(encoding="utf-8")))
    found = problems(element_en)
    if found:
        print("\n".join(found), file=sys.stderr)
        return 1
    if "--check" in argv:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != render():
            print(f"{OUTPUT.relative_to(ROOT)} is stale: run python3 tools/artise/web_wording.py", file=sys.stderr)
            return 1
        print(f"Artise wording: {len(WORDING)} of Element's texts and {len(ARTISE_TEXTS)} of Artise's OK")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render(), encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(WORDING) + len(ARTISE_TEXTS)} texts)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
