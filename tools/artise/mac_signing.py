#!/usr/bin/env python3
# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
"""The Mac build's signing certificate, made without a Mac, and the repository secrets CI signs with.

Apple's one Developer Program covers iOS and macOS, so the App Store Connect API key the iOS app already uses
(~/.artise-keys/AuthKey_<id>.p8) also asks Apple for a "Developer ID Application" certificate, the kind that
signs apps given out outside the Mac App Store, and notarizes the builds.

    tools/artise/mac_signing.py csr       # a private key and a certificate request, in ~/.artise-keys/mac-developer-id/
    tools/artise/mac_signing.py request   # asks Apple for the certificate with the API key (needs the issuer ID)
    tools/artise/mac_signing.py p12 [CER] # the certificate (+ Apple's intermediate) and the key as a .p12
    tools/artise/mac_signing.py secrets   # sets the five secrets on notesby/artise-web with gh

Apple only lets the account holder make Developer ID certificates. If `request` is refused, upload
developer-id.csr at https://developer.apple.com/account/resources/certificates/add ("Developer ID Application"),
download the .cer, and run `p12` with it.

The issuer ID (App Store Connect → Users and Access → Integrations → Team keys) is given once with --issuer and
kept in ~/.artise-keys/asc-issuer-id. Nothing here prints a key or a password.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import pathlib
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.appstoreconnect.apple.com"
REPO = "notesby/artise-web"
KEYS = pathlib.Path("~/.artise-keys").expanduser()
FOLDER = "mac-developer-id"
# Apple's intermediates for Developer ID certificates: G2 signs the ones made since 2021, G1 the older.
APPLE_CAS = (
    "https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer",
    "https://www.apple.com/certificateauthority/DeveloperIDCA.cer",
)
SECRETS = ("APPLE_CSC_LINK", "APPLE_CSC_KEY_PASSWORD", "ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8")


def certificate_request_body(csr_pem: str) -> dict:
    """What Apple's API takes to make a Developer ID Application certificate from a PEM request."""
    return {
        "data": {
            "type": "certificates",
            "attributes": {"certificateType": "DEVELOPER_ID_APPLICATION", "csrContent": csr_pem},
        }
    }


def certificate_from_answer(answer: dict) -> tuple[str, bytes]:
    """(Apple's id for it, the certificate as DER) from the API's answer, or ValueError."""
    try:
        data = answer["data"]
        return str(data["id"]), base64.b64decode(data["attributes"]["certificateContent"])
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError(f"unexpected answer from Apple: {e}") from e


def refusal(status: int, body: str) -> str:
    """One line with what Apple said, for the person."""
    try:
        errors = json.loads(body).get("errors") or []
        said = "; ".join(f"{e.get('title', '')}: {e.get('detail', '')}".strip(": ") for e in errors)
    except ValueError:
        said = body[:300]
    return f"Apple refused ({status}): {said or 'no details'}"


def make_csr(common_name: str = "Artise") -> tuple[bytes, str]:
    """(the private key as PEM, the certificate request as PEM), made here: the key never leaves this machine."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)]))
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    return key_pem, csr.public_bytes(serialization.Encoding.PEM).decode()


def p12_bytes(key_pem: bytes, cert_der: bytes, chain_der: list[bytes], password: str) -> bytes:
    """The key, the certificate and Apple's intermediates as a .p12 that macOS's `security import` reads.

    macOS still can't read the AES/PBES2 files OpenSSL 3 writes by default, so this is the older 3DES/SHA-1 form
    (the same `openssl pkcs12 -legacy` writes). The password is what protects it, not the cipher.
    """
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509 import load_der_x509_certificate

    key = serialization.load_pem_private_key(key_pem, password=None)
    cert = load_der_x509_certificate(cert_der)
    if cert.public_key().public_numbers() != key.public_key().public_numbers():
        raise ValueError("the certificate isn't for this key: make the request again with `csr`, then `request`")
    encryption = (
        serialization.PrivateFormat.PKCS12.encryption_builder()
        .kdf_rounds(50000)
        .key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
        .hmac_hash(hashes.SHA1())
        .build(password.encode())
    )
    return pkcs12.serialize_key_and_certificates(
        b"Developer ID Application", key, cert, [load_der_x509_certificate(der) for der in chain_der], encryption
    )


def issuer_of(cert_der: bytes, cas_der: list[bytes]) -> list[bytes]:
    """The intermediate that signed this certificate, as the chain to pack with it (empty if none matches)."""
    from cryptography.x509 import load_der_x509_certificate

    issuer = load_der_x509_certificate(cert_der).issuer
    return [der for der in cas_der if load_der_x509_certificate(der).subject == issuer][:1]


def secret_values(p12: bytes, password: str, key_id: str, issuer_id: str, p8: bytes) -> dict[str, str]:
    """The five repository secrets CI signs and notarizes with (.github/workflows/artise-desktop.yml)."""
    return {
        "APPLE_CSC_LINK": base64.b64encode(p12).decode(),
        "APPLE_CSC_KEY_PASSWORD": password,
        "ASC_KEY_ID": key_id,
        "ASC_ISSUER_ID": issuer_id,
        "ASC_KEY_P8": base64.b64encode(p8).decode(),
    }


# --- the commands --------------------------------------------------------------------------------------------


def folder(keys: pathlib.Path) -> pathlib.Path:
    path = keys / FOLDER
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def asc_key(keys: pathlib.Path, key_id: str | None) -> tuple[str, pathlib.Path]:
    """(key id, the .p8 file): the given id, or the one AuthKey_*.p8 in the keys folder."""
    if key_id:
        return key_id, keys / f"AuthKey_{key_id}.p8"
    found = sorted(keys.glob("AuthKey_*.p8"))
    if len(found) != 1:
        raise SystemExit(f"!! {len(found)} AuthKey_*.p8 files in {keys}: give --key-id")
    return found[0].stem.removeprefix("AuthKey_"), found[0]


def issuer_id(keys: pathlib.Path, given: str | None) -> str:
    saved = keys / "asc-issuer-id"
    if given:
        saved.write_text(given.strip() + "\n")
        saved.chmod(0o600)
        return given.strip()
    if saved.is_file():
        return saved.read_text().strip()
    raise SystemExit("!! give --issuer <App Store Connect issuer ID> once; it's kept in ~/.artise-keys/asc-issuer-id")


def token(key_id: str, issuer: str, p8: bytes) -> str:
    """A 20-minute App Store Connect token (ES256), as the iOS scripts make it."""
    import jwt

    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        p8.decode(),
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def fetch(url: str, data: bytes | None = None, headers: dict | None = None) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def cmd_csr(args: argparse.Namespace) -> int:
    path = folder(args.keys)
    key_file, csr_file = path / "developer-id.key", path / "developer-id.csr"
    if key_file.exists() and not args.force:
        raise SystemExit(f"!! {key_file} exists; --force makes a new one (the old certificate stops matching)")
    key_pem, csr_pem = make_csr()
    key_file.write_bytes(key_pem)
    key_file.chmod(0o600)
    csr_file.write_text(csr_pem)
    print(f"wrote {key_file} (private, stays here) and {csr_file}")
    return 0


def cmd_request(args: argparse.Namespace) -> int:
    path = folder(args.keys)
    csr_file = path / "developer-id.csr"
    if not csr_file.is_file():
        cmd_csr(args)
    key_id, p8_file = asc_key(args.keys, args.key_id)
    issuer = issuer_id(args.keys, args.issuer)
    bearer = token(key_id, issuer, p8_file.read_bytes())
    status, body = fetch(
        f"{API}/v1/certificates",
        json.dumps(certificate_request_body(csr_file.read_text())).encode(),
        {"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
    )
    if status not in (200, 201):
        print(refusal(status, body.decode(errors="replace")), file=sys.stderr)
        print(f"Make it by hand instead: upload {csr_file} as a Developer ID Application certificate at", file=sys.stderr)
        print("https://developer.apple.com/account/resources/certificates/add, then run: mac_signing.py p12 <the .cer>", file=sys.stderr)
        return 1
    cert_id, cert_der = certificate_from_answer(json.loads(body))
    cer_file = path / "developer-id.cer"
    cer_file.write_bytes(cert_der)
    (path / "certificate-id").write_text(cert_id + "\n")
    print(f"Apple made certificate {cert_id}: {cer_file}")
    return cmd_p12(args)


def cmd_p12(args: argparse.Namespace) -> int:
    path = folder(args.keys)
    cer_file = pathlib.Path(args.cer).expanduser() if getattr(args, "cer", None) else path / "developer-id.cer"
    key_file = path / "developer-id.key"
    if not cer_file.is_file() or not key_file.is_file():
        raise SystemExit(f"!! need {key_file} (from `csr`) and {cer_file} (from `request`, or downloaded)")
    cert_der = cer_file.read_bytes()
    if b"-----BEGIN" in cert_der:
        from cryptography.hazmat.primitives import serialization
        from cryptography.x509 import load_pem_x509_certificate

        cert_der = load_pem_x509_certificate(cert_der).public_bytes(serialization.Encoding.DER)
    cas = []
    for url in APPLE_CAS:
        status, body = fetch(url)
        if status == 200:
            cas.append(body)
    chain = issuer_of(cert_der, cas)
    if not chain:
        print("!! none of Apple's Developer ID intermediates signed this certificate; packing it alone", file=sys.stderr)
    password_file = path / "p12-password"
    if not password_file.is_file():
        password_file.write_text(secrets.token_urlsafe(24) + "\n")
        password_file.chmod(0o600)
    password = password_file.read_text().strip()
    p12_file = path / "developer-id.p12"
    p12_file.write_bytes(p12_bytes(key_file.read_bytes(), cert_der, chain, password))
    p12_file.chmod(0o600)
    print(f"wrote {p12_file} (password in {password_file}); next: mac_signing.py secrets")
    return 0


def cmd_secrets(args: argparse.Namespace) -> int:
    path = folder(args.keys)
    p12_file, password_file = path / "developer-id.p12", path / "p12-password"
    if not p12_file.is_file() or not password_file.is_file():
        raise SystemExit(f"!! no {p12_file}: run `request` (or `p12`) first")
    key_id, p8_file = asc_key(args.keys, args.key_id)
    values = secret_values(
        p12_file.read_bytes(), password_file.read_text().strip(), key_id, issuer_id(args.keys, args.issuer), p8_file.read_bytes()
    )
    for name in SECRETS:
        subprocess.run(["gh", "secret", "set", name, "-R", args.repo], input=values[name], text=True, check=True)
        print(f"set {name} on {args.repo}")
    print("CI signs and notarizes the next macOS build (Actions → Artise desktop → Run workflow to try it).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keys", type=pathlib.Path, default=KEYS, help="the keys folder (default ~/.artise-keys)")
    parser.add_argument("--key-id", help="the App Store Connect API key id (default: the one AuthKey_*.p8 there)")
    parser.add_argument("--issuer", help="the App Store Connect issuer ID, kept for next time")
    parser.add_argument("--repo", default=REPO)
    commands = parser.add_subparsers(dest="command", required=True)
    csr = commands.add_parser("csr", help="make the private key and the certificate request")
    csr.add_argument("--force", action="store_true", help="replace an existing key")
    commands.add_parser("request", help="ask Apple for the certificate through the API, then make the .p12")
    p12 = commands.add_parser("p12", help="make the .p12 from a certificate")
    p12.add_argument("cer", nargs="?", help="the .cer from Apple (default: the one `request` saved)")
    commands.add_parser("secrets", help="set the repository secrets with gh")
    args = parser.parse_args(argv)
    if not hasattr(args, "force"):
        args.force = False
    return {"csr": cmd_csr, "request": cmd_request, "p12": cmd_p12, "secrets": cmd_secrets}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
