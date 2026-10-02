# 0021 — CI: cached image builds, weekly build from scratch

- Status: Accepted
- Date: 2026-10-02

## Context

Every pull request waits for both required checks. The "Full stack" job took 11–15 minutes, and more than half
of it was `docker compose up`, which built every image from scratch on each run. The toolbox build added about
a minute to the "Lint, types, tests, scans" job.

## Decision

- CI builds images with `docker buildx bake` from `compose.yaml` (the compose files stay the only build
  definition) and caches layers in the **GitHub Actions cache** (`type=gha`, `mode=max`), one cache scope
  per image tag. Services that share an image (`raadi/init`, `raadi/toolbox`) are built once.
- The stack then starts with `docker compose up --no-build`, so the images under test are exactly the ones
  bake built (`pull_policy: build` would otherwise rebuild them).
- Cache writes use `ignore-error=true`: a cache outage slows CI down but never fails it.
- A **weekly scheduled run** (Mondays 03:17 UTC) builds everything with `no-cache`, and so does any manual
  run (`workflow_dispatch`). It catches builds that only work from cached layers (for example a package that
  disappeared upstream) and refreshes the cache.
- Data still starts cold on every run: volumes are empty, and migrations, init jobs and seeds all run.

## Consequences

- Pull requests that don't touch a Dockerfile or the dependency lockfile reuse the expensive layers
  (dependency installs, browser downloads); only the layers after `COPY` of the changed sources rebuild.
- The cache lives in GitHub (10 GB per repository, least recently used entries are evicted). Pull requests
  read the cache of `main`; their own writes stay scoped to their branch.
- A broken from-scratch build can reach `main` and is reported by the next weekly run at the latest. To check
  sooner, run the workflow manually from the Actions tab.
