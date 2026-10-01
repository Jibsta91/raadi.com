# Marketplace rules for publishing a listing (ADR-0013). Evaluated by the
# listings service on create and update:
#   POST /v1/data/raadi/listings/decision
# Input:
#   action:    "create" | "update"
#   principal: {sub, roles}
#   listing:   {category, subcategory, title, description, priceNok, imageCount}
#   context:   {activeListings}
package raadi.listings

import rego.v1

max_active_listings := 50

max_images := 10

# Upper bounds that catch typos (an extra zero) and obvious scams.
price_ceiling := {
	"torget": 1000000,
	"bil": 20000000,
	"eiendom": 200000000,
	"reise": 250000,
}

decision := {"allow": count(deny) == 0, "reasons": sort([r | some r in deny])}

privileged if "platform-admin" in input.principal.roles

deny contains "quota_exceeded" if {
	input.action == "create"
	not privileged
	input.context.activeListings >= max_active_listings
}

deny contains "price_above_ceiling" if {
	ceiling := price_ceiling[input.listing.category]
	input.listing.priceNok > ceiling
}

deny contains "too_many_images" if input.listing.imageCount > max_images

deny contains "prohibited_item" if {
	text := lower(concat(" ", [input.listing.title, input.listing.description]))
	words := {w | some w in regex.split(`[^\p{L}\p{N}]+`, text)}
	some term in data.raadi.prohibited_terms
	term in words
}
