# Treat Applications as deployed security boundaries

Each Linea Application represents one deployed `dev` or `production` boundary with its own identity configuration, allowed origins, exposed workflows, webhooks, and policy; staging and production are separate Applications. Combining environments in one Application would let a lower-trust deployment share credentials and policy with production and would reintroduce the environment ambiguity that execution-scoped classification is intended to prevent.
