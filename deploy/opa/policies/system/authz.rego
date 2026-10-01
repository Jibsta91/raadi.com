# OPA's own API authorization (opa run --authentication=token --authorization=basic).
# Each client has a bearer token; clients may only evaluate decisions under
# data.raadi (read-only). Policies cannot be changed over the API, and the
# token data itself is unreadable.
package system.authz

import rego.v1

default allow := false

# Liveness/readiness and Prometheus metrics carry no data.
allow if input.path == ["health"]

allow if input.path == ["metrics"]

allow if {
	input.method in {"GET", "POST"}
	input.path[0] == "v1"
	input.path[1] == "data"
	input.path[2] == "raadi"
	some client
	data.secrets.tokens[client] == input.identity
}
