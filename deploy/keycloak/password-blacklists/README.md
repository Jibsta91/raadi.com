# Password blocklist

`common-12plus.txt` holds the 46,146 passwords of at least 12 characters (lowercased, deduplicated) from
SecLists' `xato-net-10-million-passwords-1000000.txt`
([SecLists](https://github.com/danielmiessler/SecLists), MIT License, © 2018 Daniel Miessler). Shorter
passwords are already refused by the length policy. Keycloak's `passwordBlacklist` policy rejects any password
on this list, as OWASP ASVS 2.1.7 asks: no common or breached passwords, checked offline.

Regenerate:

```bash
curl -sSfL https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt \
  | awk 'length($0) >= 12 && length($0) <= 128' | tr 'A-Z' 'a-z' | sort -u > common-12plus.txt
```
