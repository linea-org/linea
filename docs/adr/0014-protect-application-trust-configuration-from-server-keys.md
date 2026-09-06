# Protect Application trust configuration from server keys

Identity issuers, JWKS, allowed origins, DPoP policy, API-key creation, and key scopes require an interactive workspace-admin session with recent reauthentication and cannot be changed by public server keys. A compromised Operator backend that could replace the Application's identity trust anchor could mint its own End-User Sessions and defeat the promised approval boundary even if the Decision endpoint itself rejected workspace credentials.
