# Decision logs are an audit trail (AI governance, Phase 4) but must not hold
# free text a user typed, which may contain personal data.
package system.log

import rego.v1

mask contains "/input/listing/title"

mask contains "/input/listing/description"
