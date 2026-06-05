---
name: X OAuth PKCE base64url encoding
description: How the X (Twitter) OAuth2 PKCE code_challenge must be encoded, and the bug that broke it.
---

# X OAuth PKCE code_challenge encoding

The PKCE `code_challenge` must be `BASE64URL(SHA256(ASCII(code_verifier)))` over the **raw digest bytes**.

**Rule:** base64url-encode a `Buffer` directly (`buf.toString("base64")` then url-safe replacements). Never round-trip binary through a JS string.

**Why:** A previous bug encoded the SHA-256 digest via `Buffer.from(hash.toString("binary"))`. `Buffer.from(str)` defaults to **UTF-8**, so every digest byte > 0x7f was re-encoded into multi-byte UTF-8, corrupting the challenge. The challenge no longer matched the verifier, so X rejected the authorization with *"You weren't able to give access to the App."* — the failure surfaces at X's consent screen, not as an obvious token-exchange error.

**How to apply:** A correct S256 challenge for a 32-byte verifier is exactly 43 chars of base64url with no padding. If you see a longer challenge or non-ASCII expansion, the binary→UTF-8 bug is back. Use `crypto.randomBytes` for the verifier/state and encode Buffers directly.

Callback URL is built per-request from `x-forwarded-host`/`x-forwarded-proto` and is identical in the login and callback handlers, so authorize and token-exchange `redirect_uri` always match. Scopes are minimal: `users.read tweet.read` (no `offline.access` — no refresh tokens used; no email).
