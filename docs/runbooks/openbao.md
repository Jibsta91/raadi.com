# OpenBao (secrets)

## Sealed (`OpenBaoSealed`)

OpenBao seals itself on restart. `openbao-unsealer` re-unseals it within seconds using the key in the
root-only secrets area.

```bash
docker compose logs --tail=50 openbao-unsealer openbao
docker compose up -d openbao-unsealer        # if the unsealer is not running
```

If the unsealer reports _"uninitialised but an unseal key exists"_, the OpenBao data volume was lost while the
keys remain. Restore the OpenBao volume from backup ([Phase 5 backups](../deploy.md)). Never delete the keys.

## Sealed, and no unseal key is stored

`openbao-unsealer` exits with "OpenBao is sealed and no unseal key is stored" when OpenBao reports that it is
initialised, but the secrets volume holds no unseal key. Typical causes: the secrets volume was deleted
while the OpenBao volume was kept, or (before 2026-10-02) an initialisation that timed out on a slow host.
OpenBao cannot be opened without that key.

- **Development:** reset both volumes. All generated secrets are recreated on the next start:
  `docker compose down -v && docker compose up -d --wait`.
- **Production:** restore the secrets volume (`_openbao/unseal_key`) and the OpenBao volume from the same
  restic snapshot. Never initialise OpenBao again over existing data.

## Read a generated secret

```bash
./raadi secret keycloak_admin_password     # any name from deploy/init/manifest.json
./raadi secret openbao_root_token          # OpenBao UI: http://bao.raadi.localhost
```

## Rotate a secret

1. Remove the master copy, then let `secrets-init` regenerate it and the bootstrap jobs propagate it:
   ```bash
   docker compose run --rm --no-deps --entrypoint rm secrets-init /secrets/_master/<name>
   docker compose up -d --force-recreate   # re-runs init containers, restarts consumers
   ```
2. Database passwords are re-applied by `db-init` (`ALTER ROLE … PASSWORD`). Keycloak client secrets are
   re-applied by `keycloak-init`. Services read the new values from OpenBao on restart.
3. `postgres_superuser_password` is only used at database initialisation. To rotate it, run
   `ALTER ROLE postgres PASSWORD …` yourself before regenerating.

## Re-issue a service's AppRole

```bash
docker compose run --rm --no-deps --entrypoint rm secrets-init /secrets/approle/<service>/secret_id
docker compose up -d --force-recreate openbao-bootstrap <service>
```

## Hardening the unseal key (production)

By default the single unseal key is stored next to the data (see [ADR-0005](../adr/0005-secrets-bootstrap-openbao.md)).
For stronger isolation, either keep the unseal key off-box and unseal manually after reboots, or configure a
`seal "transit"` / cloud KMS auto-unseal in `deploy/openbao/config.hcl`.
