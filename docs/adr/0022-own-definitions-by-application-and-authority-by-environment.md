# Own definitions by Application and runtime authority by Environment

An Application is one Operator product, owns Agent and Workflow definitions, and starts with Development and Production Environments; it is neither a deployed version nor a Project folder. Each Environment selects the published definition versions it serves and independently owns runtime keys, identity trust, Connections, Connection Access Grants, reviewer assignments, and runtime configuration, preserving production isolation while making the product hierarchy explicit. This supersedes ADR 0004's Application-as-deployment terminology; the isolation, trust protection, consent, and retention boundaries described by earlier ADRs apply to Environment instead.

## Consequences

There are no existing customers requiring a compatibility layer or customer-data migration; replace the organization model directly, allowing a reset of explicitly identified local development data. Hosted data resets require separate identification and authorization. This records the target model; implementation must move schema constraints, APIs, SDKs, runtime authorization, and management navigation together before the new hierarchy is treated as shipped.

External Subject retains its person-oriented meaning. Subject-owned Connections remain available; shared Connections belong to an Environment, require explicit subject access grants, and accept exact-action consent only from an assigned authenticated reviewer. A server key may request work but cannot impersonate a human reviewer; the requester may approve only when independently authorized as a reviewer.

Agents and Workflows remain distinct capabilities with shared execution services and separately persisted control state. Custom Environments, Project resources, and cross-Application definition sharing are outside the initial organization model.
