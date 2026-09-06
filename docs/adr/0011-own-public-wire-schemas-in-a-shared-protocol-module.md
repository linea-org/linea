# Own public wire schemas in a shared protocol module

`packages/protocol` will own public request, response, event, enum, and error schemas consumed by the platform API, SDKs, OpenAPI generation, and contract tests, while database and internal module types remain private. The protocol already has several real consumers, and duplicating its security-sensitive shapes would let server, SDK, React, and mobile behavior drift; SDK methods remain hand-written so schema sharing does not turn the client interface into a route-for-route mirror.
