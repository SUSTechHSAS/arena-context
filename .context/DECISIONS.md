# Decisions and rationale

- Owner-directed: Rust; three-dimensional torus physics, climate/ecology, configurable planet scale, on-demand refinement to the requested 1 m³ unit. Full wording: OWNER_REQUEST.md.
- Workflow: plan first, then implement the human-reviewed plan. Imported specifications are reference inputs, not verified results.
- Deferred payload remains opaque until final acceptance and closure of the complete terrain-generation task.

## Fingerprint ambiguity maintenance (proposed)

The owner requested continuation when all statistically indistinguishable models are explicitly accepted. Use the existing fit/separation/family thresholds and the complete bank, not the three display candidates or a model-family wildcard. Preserve family_only and identified_candidate=null; any unaccepted candidate or missing evidence still denies work. CI independently recomputes the set. Previously denied turns remain denied. See docs/FINGERPRINT.md and shared PR #16 for the exact user regression sample and validation. This proposal needs owner review and does not change the domain task contract.
