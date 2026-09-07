# Separate Application and workspace server credentials

The server SDK exposes an Application client backed by a key that can access exactly one Application and a workspace client backed by independently scoped workspace authority. Sharing one broad key or inferring the boundary from method parameters would turn a leak in one deployed product into cross-Application access, while neither credential may replace End-User proof or modify Application identity trust configuration.
