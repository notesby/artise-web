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
# A plural is {"one": …, "other": …} in each language, with %(count)s, as in Element's own string files.
ARTISE_TEXTS: dict[str, tuple[object, object, object]] = {
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
    # Notification hours (W4-1), worded like Android's artise_notification_hours_strings.xml; kept per browser.
    "artise|hours|title": ("Notification hours", "Horario de notificaciones", "Horário das notificações"),
    "artise|hours|description_browser": (
        "Outside these hours, this workspace's notifications arrive without sound in this browser. Ari's reminders always sound.",
        "Fuera de este horario, las notificaciones de este espacio de trabajo llegan sin sonido en este navegador. Los recordatorios de Ari siempre suenan.",
        "Fora deste horário, as notificações deste espaço de trabalho chegam sem som neste navegador. Os lembretes do Ari sempre tocam.",
    ),
    "artise|hours|description_computer": (
        "Outside these hours, this workspace's notifications arrive without sound on this computer. Ari's reminders always sound.",
        "Fuera de este horario, las notificaciones de este espacio de trabajo llegan sin sonido en esta computadora. Los recordatorios de Ari siempre suenan.",
        "Fora deste horário, as notificações deste espaço de trabalho chegam sem som neste computador. Os lembretes do Ari sempre tocam.",
    ),
    "artise|hours|days": ("Days", "Días", "Dias"),
    "artise|hours|every_day": ("Every day", "Todos los días", "Todos os dias"),
    "artise|hours|weekdays": ("Monday to Friday", "De lunes a viernes", "De segunda a sexta"),
    "artise|hours|custom": ("Custom", "Personalizado", "Personalizado"),
    "artise|hours|weekdays_footer": (
        "On Saturday and Sunday, notifications arrive without sound.",
        "El sábado y el domingo, las notificaciones llegan sin sonido.",
        "No sábado e no domingo, as notificações chegam sem som.",
    ),
    "artise|hours|custom_footer": (
        "On a day that's off, notifications arrive without sound. If Until is earlier than From, the hours go past midnight.",
        "En un día apagado, las notificaciones llegan sin sonido. Si «Hasta» es antes que «Desde», el horario pasa de la medianoche.",
        "Num dia desligado, as notificações chegam sem som. Se “Até” for antes de “De”, o horário passa da meia-noite.",
    ),
    "artise|hours|hours": ("Hours", "Horario", "Horário"),
    "artise|hours|from": ("From", "Desde", "De"),
    "artise|hours|until": ("Until", "Hasta", "Até"),
    "artise|hours|mentions": (
        "Mentions and replies always sound",
        "Las menciones y respuestas siempre suenan",
        "Menções e respostas sempre tocam",
    ),
    "artise|hours|not_kept": (
        "This browser won't keep these settings (its storage is blocked).",
        "Este navegador no guarda esta configuración (tiene bloqueado el almacenamiento).",
        "Este navegador não guarda estas configurações (o armazenamento está bloqueado).",
    ),
    # The Notes page (W3-2), worded like Android's artise/notes texts.
    "artise|notes|title": ("Notes", "Notas", "Notas"),
    "artise|notes|back": ("Back to the chat", "Volver al chat", "Voltar à conversa"),
    "artise|notes|retry": ("Try again", "Reintentar", "Tentar de novo"),
    "artise|notes|tree": ("Files", "Archivos", "Arquivos"),
    "artise|notes|task": ("Done", "Hecho", "Feito"),
    "artise|notes|download": ("Download", "Descargar", "Baixar"),
    "artise|notes|open": ("Open", "Abrir", "Abrir"),
    "artise|notes|choose_chat": (
        "Pick a chat to see its notes.",
        "Elige un chat para ver sus notas.",
        "Escolha uma conversa para ver as notas.",
    ),
    "artise|notes|no_chats": (
        "None of your chats has notes yet.",
        "Ninguno de tus chats tiene notas todavía.",
        "Nenhuma das suas conversas tem notas ainda.",
    ),
    "artise|notes|empty": ("There are no notes here yet.", "Todavía no hay notas aquí.", "Ainda não há notas aqui."),
    "artise|notes|pick": ("Pick a note to read it.", "Elige una nota para leerla.", "Escolha uma nota para ler."),
    "artise|notes|missing": (
        "“%(name)s” doesn't exist yet.",
        "“%(name)s” todavía no existe.",
        "“%(name)s” ainda não existe.",
    ),
    "artise|notes|file_open": (
        "Open it in a new tab or download it.",
        "Ábrelo en una pestaña nueva o descárgalo.",
        "Abra em uma nova aba ou baixe.",
    ),
    "artise|notes|file_download": (
        "Download it to open it on your computer.",
        "Descárgalo para abrirlo en tu computadora.",
        "Baixe para abrir no seu computador.",
    ),
    "artise|notes|privacy": (
        "%(assistant)s can read the notes in this chat, so they're stored on the Artise server, not end-to-end encrypted like your messages.",
        "%(assistant)s puede leer las notas de este chat, así que se guardan en el servidor de Artise, sin el cifrado de extremo a extremo de tus mensajes.",
        "O %(assistant)s pode ler as notas desta conversa, por isso elas ficam guardadas no servidor do Artise, sem a criptografia de ponta a ponta das suas mensagens.",
    ),
    # Editing notes (W3-3), worded like Android's artise/notes texts.
    "artise|notes|edit": ("Edit", "Editar", "Editar"),
    "artise|notes|save": ("Save", "Guardar", "Salvar"),
    "artise|notes|cancel": ("Cancel", "Cancelar", "Cancelar"),
    "artise|notes|editor_label": ("The note's text", "Texto de la nota", "Texto da nota"),
    "artise|notes|preview": ("Preview", "Vista previa", "Pré-visualização"),
    "artise|notes|suggestions": ("Notes and files", "Notas y archivos", "Notas e arquivos"),
    "artise|notes|new_note": ("New note", "Nueva nota", "Nova nota"),
    "artise|notes|name": ("Name", "Nombre", "Nome"),
    "artise|notes|create": ("Create", "Crear", "Criar"),
    "artise|notes|name_invalid": ("Use a name without “/”.", "Usa un nombre sin “/”.", "Use um nome sem “/”."),
    "artise|notes|name_exists": (
        "There's already a note with this name.",
        "Ya hay una nota con este nombre.",
        "Já existe uma nota com este nome.",
    ),
    "artise|notes|merged": (
        "Someone else changed other lines while you were editing. Both changes were saved.",
        "Otra persona cambió otras líneas mientras editabas. Se guardaron los dos cambios.",
        "Outra pessoa alterou outras linhas enquanto você editava. As duas alterações foram salvas.",
    ),
    "artise|notes|combine_hint": (
        "Your version is above the line and the other one below. Keep what you want, then save.",
        "Tu versión está arriba de la línea y la otra abajo. Deja lo que quieras y guarda.",
        "Sua versão está acima da linha e a outra, abaixo. Mantenha o que quiser e salve.",
    ),
    "artise|notes|choice_mine": ("Your version", "Tu versión", "Sua versão"),
    "artise|notes|choice_theirs": ("The other version", "La otra versión", "A outra versão"),
    "artise|notes|keep_mine": ("Keep mine", "Quedarme con la mía", "Manter a minha"),
    "artise|notes|keep_theirs": ("Keep the other", "Quedarme con la otra", "Manter a outra"),
    "artise|notes|combine": ("Combine", "Combinar", "Combinar"),
    "artise|notes|keep_copy": ("Keep my copy", "Conservar mi copia", "Manter minha cópia"),
    "artise|notes|discard": ("Discard my change", "Descartar mi cambio", "Descartar minha alteração"),
    "artise|notes|unsaved": (
        "You have changes that aren't saved. Leave without saving?",
        "Tienes cambios sin guardar. ¿Salir sin guardarlos?",
        "Você tem alterações não salvas. Sair sem salvar?",
    ),
    "artise|notes|keep_editing": ("Keep editing", "Seguir editando", "Continuar editando"),
    "artise|notes|leave": ("Leave without saving", "Salir sin guardar", "Sair sem salvar"),
    # Renaming, moving, deleting, folders and uploads (W3-3), worded like Android's artise/notes texts.
    "artise|notes|more_actions": ("More actions", "Más acciones", "Mais ações"),
    "artise|notes|rename": ("Rename", "Cambiar nombre", "Renomear"),
    "artise|notes|move": ("Move", "Mover", "Mover"),
    "artise|notes|delete": ("Delete", "Borrar", "Excluir"),
    "artise|notes|delete_title": ("Delete “%(name)s”?", "¿Borrar “%(name)s”?", "Excluir “%(name)s”?"),
    "artise|notes|delete_note_message": (
        "It's deleted for everyone in this chat. Its earlier versions stay in the notes' history.",
        "Se borra para todos en este chat. Sus versiones anteriores quedan en el historial de las notas.",
        "Ela será excluída para todos nesta conversa. As versões anteriores ficam no histórico das notas.",
    ),
    "artise|notes|delete_file_message": (
        "It's deleted for everyone in this chat. It stays in the trash for 30 days.",
        "Se borra para todos en este chat. Queda en la papelera durante 30 días.",
        "Ele será excluído para todos nesta conversa. Fica na lixeira por 30 dias.",
    ),
    "artise|notes|delete_used_in": (
        "It's shown or linked in: %(notes)s. Those notes will show its name instead.",
        "Se muestra o enlaza en: %(notes)s. Esas notas mostrarán su nombre en su lugar.",
        "Ele aparece ou tem link em: %(notes)s. Essas notas vão mostrar o nome no lugar.",
    ),
    "artise|notes|delete_folder_empty": (
        "It's empty. It's deleted for everyone in this chat.",
        "Está vacía. Se borra para todos en este chat.",
        "Ela está vazia. Será excluída para todos nesta conversa.",
    ),
    "artise|notes|delete_folder_message": (
        "Everything inside is deleted for everyone in this chat: %(contents)s. Notes stay in the notes' history, and photos and files stay in the trash for 30 days.",
        "Todo lo que contiene se borra para todos en este chat: %(contents)s. Las notas quedan en el historial de notas, y las fotos y archivos en la papelera durante 30 días.",
        "Tudo o que está dentro será excluído para todos nesta conversa: %(contents)s. As notas ficam no histórico das notas, e as fotos e arquivos ficam na lixeira por 30 dias.",
    ),
    "artise|notes|count_notes": (
        {"one": "%(count)s note", "other": "%(count)s notes"},
        {"one": "%(count)s nota", "other": "%(count)s notas"},
        {"one": "%(count)s nota", "other": "%(count)s notas"},
    ),
    "artise|notes|count_files": (
        {"one": "%(count)s photo or file", "other": "%(count)s photos or files"},
        {"one": "%(count)s foto o archivo", "other": "%(count)s fotos o archivos"},
        {"one": "%(count)s foto ou arquivo", "other": "%(count)s fotos ou arquivos"},
    ),
    "artise|notes|count_folders": (
        {"one": "%(count)s folder", "other": "%(count)s folders"},
        {"one": "%(count)s carpeta", "other": "%(count)s carpetas"},
        {"one": "%(count)s pasta", "other": "%(count)s pastas"},
    ),
    "artise|notes|delete_folder": ("Delete this folder", "Borrar esta carpeta", "Excluir esta pasta"),
    "artise|notes|move_title": ("Move “%(name)s” to…", "Mover “%(name)s” a…", "Mover “%(name)s” para…"),
    "artise|notes|move_top_level": ("Notes (top level)", "Notas (nivel principal)", "Notas (nível principal)"),
    "artise|notes|move_here": ("It's here now", "Está aquí ahora", "Está aqui agora"),
    "artise|notes|new_folder": ("New folder", "Nueva carpeta", "Nova pasta"),
    "artise|notes|folder_name": ("Folder name", "Nombre de la carpeta", "Nome da pasta"),
    "artise|notes|folder_name_hint": (
        "Use “/” for a folder inside another, like Recipes/Desserts.",
        "Usa “/” para una carpeta dentro de otra, como Recetas/Postres.",
        "Use “/” para uma pasta dentro de outra, como Receitas/Sobremesas.",
    ),
    "artise|notes|folder_exists": (
        "There's already a folder or file with that name here.",
        "Ya hay una carpeta o archivo con ese nombre aquí.",
        "Já existe uma pasta ou arquivo com esse nome aqui.",
    ),
    "artise|notes|changed_meanwhile": (
        "Someone else changed it in the meantime. Try again.",
        "Alguien más lo cambió mientras tanto. Inténtalo de nuevo.",
        "Outra pessoa alterou isso nesse meio-tempo. Tente de novo.",
    ),
    "artise|notes|upload": ("Add a file", "Agregar archivo", "Adicionar arquivo"),
    "artise|notes|uploading": ("Uploading “%(name)s”…", "Subiendo “%(name)s”…", "Enviando “%(name)s”…"),
    "artise|notes|upload_too_big": (
        "That file is over 50 MB.",
        "Ese archivo pesa más de 50 MB.",
        "Esse arquivo tem mais de 50 MB.",
    ),
    "artise|notes|upload_failed": (
        "Couldn't add the file. Try again.",
        "No se pudo adjuntar el archivo. Inténtalo de nuevo.",
        "Não foi possível adicionar o arquivo. Tente de novo.",
    ),
    # History, search, links and saving messages (W3-4), worded like Android's artise/notes texts.
    "artise|notes|history": ("History", "Historial", "Histórico"),
    "artise|notes|history_empty": ("No changes yet.", "Todavía no hay cambios.", "Ainda não há alterações."),
    "artise|notes|history_entry": ("%(by)s · %(when)s", "%(by)s · %(when)s", "%(by)s · %(when)s"),
    "artise|notes|history_version": (
        "The note as it was on %(when)s, by %(by)s.",
        "La nota como estaba el %(when)s, por %(by)s.",
        "A nota como estava em %(when)s, por %(by)s.",
    ),
    "artise|notes|restore": ("Restore this version", "Restaurar esta versión", "Restaurar esta versão"),
    "artise|notes|back_to_note": ("Back to the note", "Volver a la nota", "Voltar à nota"),
    "artise|notes|linked_from": ("Linked from", "Enlazada desde", "Vinculada em"),
    "artise|notes|search": ("Search notes", "Buscar en las notas", "Buscar notas"),
    "artise|notes|search_empty": (
        "Nothing found for “%(query)s”.",
        "No se encontró nada para “%(query)s”.",
        "Nada encontrado para “%(query)s”.",
    ),
    "artise|notes|clear_search": ("Clear search", "Borrar búsqueda", "Limpar busca"),
    "artise|notes|save_message": ("Save to Notes", "Guardar en Notas", "Salvar nas Notas"),
    "artise|notes|saved_messages_folder": ("Saved messages", "Mensajes guardados", "Mensagens salvas"),
    "artise|notes|saved_message": (
        "Saved to this chat's Notes",
        "Guardado en las Notas de este chat",
        "Salvo nas Notas desta conversa",
    ),
    "artise|notes|save_message_failed": (
        "Couldn't save it to Notes. Try again.",
        "No se pudo guardar en Notas. Inténtalo de nuevo.",
        "Não foi possível salvar nas Notas. Tente de novo.",
    ),
    "artise|notes|open_note": ("Open the note", "Abrir la nota", "Abrir a nota"),
    "artise|notes|close": ("Close", "Cerrar", "Fechar"),
    # The Notes API's errors, one plain sentence each (Android's artise/notes texts where they exist).
    "artise|notes|error|unauthorized": (
        "Couldn't confirm it's you. Reload the page and try again.",
        "No pudimos confirmar que eres tú. Recarga la página e inténtalo de nuevo.",
        "Não conseguimos confirmar que é você. Recarregue a página e tente de novo.",
    ),
    "artise|notes|error|no_chat": (
        "This chat has no notes, or you're no longer in it.",
        "Este chat no tiene notas, o ya no estás en él.",
        "Esta conversa não tem notas, ou você não está mais nela.",
    ),
    "artise|notes|error|bad_path": (
        "That name can't be used here.",
        "Ese nombre no se puede usar aquí.",
        "Esse nome não pode ser usado aqui.",
    ),
    "artise|notes|error|not_found": (
        "Someone else deleted or moved it in the meantime.",
        "Alguien más lo borró o lo movió mientras tanto.",
        "Outra pessoa excluiu ou moveu isso nesse meio-tempo.",
    ),
    "artise|notes|error|exists": (
        "There's already a note or file with that name there.",
        "Ya hay una nota o un archivo con ese nombre ahí.",
        "Já existe uma nota ou arquivo com esse nome ali.",
    ),
    "artise|notes|error|conflict": (
        "Someone else changed the same lines while you were editing.",
        "Otra persona cambió las mismas líneas mientras editabas.",
        "Outra pessoa alterou as mesmas linhas enquanto você editava.",
    ),
    "artise|notes|error|deleted": (
        "Someone deleted this note while you were editing it.",
        "Otra persona borró esta nota mientras la editabas.",
        "Outra pessoa excluiu esta nota enquanto você a editava.",
    ),
    "artise|notes|error|too_big": (
        "It's too big: up to 1 MB for a note and 50 MB for a file.",
        "Es demasiado grande: hasta 1 MB para una nota y 50 MB para un archivo.",
        "É grande demais: até 1 MB para uma nota e 50 MB para um arquivo.",
    ),
    "artise|notes|error|not_a_note": (
        "That file isn't a note.",
        "Ese archivo no es una nota.",
        "Esse arquivo não é uma nota.",
    ),
    "artise|notes|error|not_empty": (
        "The folder isn't empty.",
        "La carpeta no está vacía.",
        "A pasta não está vazia.",
    ),
    "artise|notes|error|not_in_trash": (
        "It's no longer in the trash (things stay there for 30 days).",
        "Ya no está en la papelera (las cosas se guardan ahí 30 días).",
        "Não está mais na lixeira (as coisas ficam lá por 30 dias).",
    ),
    "artise|notes|error|offline": (
        "This needs a connection. Try again when you're online.",
        "Esto necesita conexión. Inténtalo cuando tengas internet.",
        "Para isso, é preciso ter conexão. Tente de novo quando estiver online.",
    ),
    "artise|notes|error|failed": ("Couldn't do it. Try again.", "No se pudo hacer. Inténtalo de nuevo.", "Não foi possível. Tente de novo."),
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
        plural = isinstance(texts[0], dict)
        wanted = sorted(PLACEHOLDER.findall(_texts(texts[0])[0]))
        for language, text in zip(("en", "es", "pt"), texts):
            if isinstance(text, dict) != plural:
                found.append(f"{key} [{language}]: plural in one place and not the other")
                continue
            if plural and not {"one", "other"} <= set(text):
                found.append(f"{key} [{language}]: a plural needs 'one' and 'other'")
            for form in _texts(text):
                if not form.strip():
                    found.append(f"{key} [{language}]: empty")
                if sorted(PLACEHOLDER.findall(form)) != wanted:
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
