# Architecture Decision Records

Short records of significant decisions ([format](0001-record-architecture-decisions.md)). New ADRs take the next
number; superseded ADRs stay in place with a link to their replacement.

| #                                                 | Decision                                                                        | Status   |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)     | Record architecture decisions                                                   | Accepted |
| [0002](0002-typescript-nestjs-and-python.md)      | TypeScript (NestJS) for domain services, Python for AI                          | Accepted |
| [0003](0003-single-compose-project.md)            | One Compose project for laptop and cloud                                        | Accepted |
| [0004](0004-token-handler-bff.md)                 | Token-handler BFF and zero-trust JWT validation                                 | Accepted |
| [0005](0005-secrets-bootstrap-openbao.md)         | First-boot secrets, OpenBao AppRole, single-key unseal                          | Accepted |
| [0006](0006-gateway-file-provider-and-dev-tls.md) | Traefik with file provider, `*.localhost`, local dev CA                         | Accepted |
| [0007](0007-observability-pipeline.md)            | OpenTelemetry everywhere through one collector                                  | Accepted |
| [0008](0008-database-per-service-and-outbox.md)   | Database per service, dbmate migrations, transactional outbox                   | Accepted |
| [0009](0009-open-source-licensing-policy.md)      | OSI-only licensing policy                                                       | Accepted |
| [0010](0010-pinned-versions.md)                   | Version pinning and deliberate version choices                                  | Accepted |
| [0011](0011-resource-budget.md)                   | 16 GB laptop resource budget and profiles                                       | Accepted |
| [0012](0012-event-backbone.md)                    | Event backbone: Kafka, Debezium outbox, Apicurio contracts                      | Accepted |
| [0013](0013-authorization.md)                     | Authorization: OpenFGA relationships, OPA rules, fail closed                    | Accepted |
| [0014](0014-media-pipeline.md)                    | Media pipeline: scan, re-encode, signed URLs, orphan GC                         | Accepted |
| [0015](0015-search.md)                            | Search: OpenSearch fed by listing events                                        | Accepted |
| [0016](0016-messaging.md)                         | Messaging: REST to send, WebSocket to push, participants on the row             | Accepted |
| [0017](0017-notifications.md)                     | Notifications: events in, queued e-mail out, addresses looked up at send time   | Accepted |
| [0018](0018-reviews-and-trust.md)                 | Reviews only after a real deal; BankID over OIDC, no national ID stored         | Accepted |
| [0019](0019-sign-up.md)                           | Sign-up: Keycloak's hosted registration with a Raadi theme                      | Accepted |
| [0020](0020-payments.md)                          | Payments: provider adapters, idempotent orders, signed webhooks, reconciliation | Accepted |
| [0021](0021-ci-build-cache.md)                    | CI: cached image builds, weekly build from scratch                              | Accepted |
