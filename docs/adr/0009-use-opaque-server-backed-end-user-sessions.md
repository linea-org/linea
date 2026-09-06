# Use opaque server-backed End-User Sessions

End-User Session access tokens will be opaque, stored hashed, bound to a DPoP key, and resolved through revocable server-side state rather than encoded as self-contained JWTs. Every authorized request already needs current Application, subject, revocation, and proof state, so a database lookup is required regardless; opaque tokens avoid stale claims and signing-key lifecycle while keeping immediate revocation authoritative.
