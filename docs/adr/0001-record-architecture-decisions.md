# 0001 — Record architecture decisions

- Status: Accepted
- Date: 2026-10-01

## Context

Raadi is built in phases by people who were not present for earlier decisions. The reasoning behind choices
(not just the choices) must survive.

## Decision

We keep lightweight ADRs in `docs/adr/`, one Markdown file per decision, each with Context, Decision and
Consequences, written in plain language. Any change that alters an ADR's decision adds a new ADR that supersedes it.

## Consequences

Reviews can point at an ADR instead of re-arguing a decision. Writing an ADR is part of "done" for any
significant change.
