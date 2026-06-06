---
name: bash/grep output redaction quirk
description: Some identifiers come back mangled in bash/grep/rg output; trust the read tool for exact source.
---

# bash/grep output can mangle identifiers

In this environment, `rg`/`grep`/bash output has shown identifiers replaced/garbled (e.g. `useAccount`→`ln`, `XAuthProvider`→`lnProvider`, `/auth/x/me`→`/ln`) that do NOT match the real file contents. The `read` tool returns the true, unmangled source.

**How to apply:** Use `rg`/`glob` to LOCATE files and line numbers, but never trust the exact string contents from bash output for editing decisions — confirm with the `read` tool before reasoning about or editing code. This wasted time during the X-auth/guest-mode work.
