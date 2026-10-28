# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
"""mac_signing.py: the parts that don't talk to Apple or GitHub.

    python3 -m unittest tools/artise/test_mac_signing.py
"""

from __future__ import annotations

import base64
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mac_signing  # noqa: E402

try:
    import cryptography  # noqa: F401

    HAS_CRYPTOGRAPHY = True
except ImportError:  # The owner's machine has it; CI's checks don't need it.
    HAS_CRYPTOGRAPHY = False


def self_signed(key_pem: bytes, name: str, issuer_name: str | None = None, issuer_key=None) -> bytes:
    """A certificate for the key, as DER: self-signed, or signed by another key as an "intermediate" would."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.x509.oid import NameOID

    key = serialization.load_pem_private_key(key_pem, password=None)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_name or name)])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + dt.timedelta(days=1))
        .sign(issuer_key or key, hashes.SHA256())
    )
    return cert.public_bytes(serialization.Encoding.DER)


class RequestBody(unittest.TestCase):
    def test_asks_apple_for_a_developer_id_application_certificate(self) -> None:
        body = mac_signing.certificate_request_body("-----BEGIN CERTIFICATE REQUEST-----\nabc\n-----END CERTIFICATE REQUEST-----\n")
        self.assertEqual(body["data"]["type"], "certificates")
        self.assertEqual(body["data"]["attributes"]["certificateType"], "DEVELOPER_ID_APPLICATION")
        self.assertIn("BEGIN CERTIFICATE REQUEST", body["data"]["attributes"]["csrContent"])

    def test_the_answer_gives_the_id_and_the_der(self) -> None:
        cert_id, der = mac_signing.certificate_from_answer(
            {"data": {"id": "ABC123", "attributes": {"certificateContent": base64.b64encode(b"\x30\x03").decode()}}}
        )
        self.assertEqual((cert_id, der), ("ABC123", b"\x30\x03"))

    def test_a_strange_answer_is_an_error_not_a_crash(self) -> None:
        with self.assertRaises(ValueError):
            mac_signing.certificate_from_answer({"data": {"id": "x"}})

    def test_a_refusal_quotes_apple(self) -> None:
        said = mac_signing.refusal(403, '{"errors":[{"title":"Forbidden","detail":"Only the Account Holder can create this."}]}')
        self.assertEqual(said, "Apple refused (403): Forbidden: Only the Account Holder can create this.")
        self.assertEqual(mac_signing.refusal(500, "<html>"), "Apple refused (500): <html>")
        self.assertIn("no details", mac_signing.refusal(500, "{}"))


@unittest.skipUnless(HAS_CRYPTOGRAPHY, "needs the cryptography package")
class KeyAndCertificate(unittest.TestCase):
    def test_the_request_is_for_a_fresh_rsa_key_named_artise(self) -> None:
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization

        key_pem, csr_pem = mac_signing.make_csr()
        self.assertIn(b"BEGIN PRIVATE KEY", key_pem)
        csr = x509.load_pem_x509_csr(csr_pem.encode())
        self.assertTrue(csr.is_signature_valid)
        self.assertEqual(csr.subject.rfc4514_string(), "CN=Artise")
        key = serialization.load_pem_private_key(key_pem, password=None)
        self.assertEqual(csr.public_key().public_numbers(), key.public_key().public_numbers())

    def test_the_p12_holds_the_key_the_certificate_and_the_chain_in_the_form_macos_reads(self) -> None:
        from cryptography.hazmat.primitives.serialization import pkcs12

        ca_key_pem, _ = mac_signing.make_csr("CA")
        from cryptography.hazmat.primitives import serialization

        ca_key = serialization.load_pem_private_key(ca_key_pem, password=None)
        ca_der = self_signed(ca_key_pem, "Developer ID Certification Authority")
        key_pem, _ = mac_signing.make_csr()
        cert_der = self_signed(key_pem, "Developer ID Application: Artise", "Developer ID Certification Authority", ca_key)
        p12 = mac_signing.p12_bytes(key_pem, cert_der, [ca_der], "secret")
        key, cert, chain = pkcs12.load_key_and_certificates(p12, b"secret")
        self.assertIsNotNone(key)
        self.assertEqual(cert.subject.rfc4514_string(), "CN=Developer ID Application: Artise")
        self.assertEqual([c.subject.rfc4514_string() for c in chain], ["CN=Developer ID Certification Authority"])
        # The older cipher macOS's `security import` still needs (OpenSSL 3 would write AES, which it refuses).
        self.assertIn(b"\x2a\x86\x48\x86\xf7\x0d\x01\x0c\x01\x03", p12)  # pbeWithSHA1And3-KeyTripleDES-CBC

    def test_a_certificate_for_another_key_is_refused(self) -> None:
        key_pem, _ = mac_signing.make_csr()
        other_pem, _ = mac_signing.make_csr()
        cert_der = self_signed(other_pem, "Developer ID Application: Artise")
        with self.assertRaises(ValueError):
            mac_signing.p12_bytes(key_pem, cert_der, [], "secret")

    def test_the_chain_is_the_intermediate_that_signed_the_certificate(self) -> None:
        from cryptography.hazmat.primitives import serialization

        g1_pem, _ = mac_signing.make_csr("G1")
        g2_pem, _ = mac_signing.make_csr("G2")
        g1 = self_signed(g1_pem, "Developer ID Certification Authority")
        g2 = self_signed(g2_pem, "Developer ID Certification Authority G2")
        key_pem, _ = mac_signing.make_csr()
        g2_key = serialization.load_pem_private_key(g2_pem, password=None)
        cert = self_signed(key_pem, "Developer ID Application: Artise", "Developer ID Certification Authority G2", g2_key)
        self.assertEqual(mac_signing.issuer_of(cert, [g1, g2]), [g2])
        self.assertEqual(mac_signing.issuer_of(cert, [g1]), [])


class Secrets(unittest.TestCase):
    def test_the_five_secrets_ci_signs_with(self) -> None:
        values = mac_signing.secret_values(b"p12", "pw", "84MP92MQRY", "11111111-2222", b"-----BEGIN PRIVATE KEY-----")
        self.assertEqual(set(values), set(mac_signing.SECRETS))
        self.assertEqual(base64.b64decode(values["APPLE_CSC_LINK"]), b"p12")
        self.assertEqual(values["APPLE_CSC_KEY_PASSWORD"], "pw")
        self.assertEqual(base64.b64decode(values["ASC_KEY_P8"]), b"-----BEGIN PRIVATE KEY-----")
        self.assertNotIn("\n", values["APPLE_CSC_LINK"])


if __name__ == "__main__":
    unittest.main()
