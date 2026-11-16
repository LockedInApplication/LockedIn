# Photo provider implementation / activation gate

This is implementation evidence, not authorization to enable the feature. Photos default off. No live Cloudinary call or real person's image was used.

Runtime requires Node >=20.9.0 and the platform's sharp native binary. Dependencies pinned: cloudinary 2.11.0, @fastify/multipart 10.1.9 (Fastify 5), sharp 0.35.5. Keep backend credentials backend-only.

The real Cloudinary SDK signs and serializes authenticated image uploads with reserved UUID-based public IDs, overwrite disabled, JPEG only, no generated public derivatives. Tests intercept only Node HTTPS transport. Local private downloads use the signed non-CDN API download endpoint, a 30-second expiry, no redirects, 20-second total deadline and 5 MiB bound; signed URLs are never returned. Admin resource lookup uses the reserved ID, not another upload, for ambiguous results. Missing screening labels fail closed. The resource API has no `moderation=true` parameter; do not rely on a silently discarded SDK option.

Policy `aws-rek-photo-v2` uses documented result confidences 0–100 and matches label and parent names without regard to capitalization. Prohibited categories reject at >=90 and hold at >=50. Sensitive and unrecognized categories hold at >=50. A broad Suggestive label holds at >=50 unless the provider also returns a more specific child at >=50; known benign child clothing/swimwear does not reject. A provider rejection cannot become an automatic approval. Missing, mixed, malformed or incomplete screening cannot approve. Existing `aws-rek-photo-v1` decisions retain their original status and moderator explanation; v1 held unknown names regardless of confidence.

Exact supported names are maintained in the `prohibited`, `uncertain` and `benign` sets in `photo-policy.ts`; any new taxonomy name is deliberately not silently accepted. This does not determine age, identity or ownership, and thresholds are uncalibrated policy settings, not an accuracy guarantee.

Explicit Cloudinary configuration: `aws_rek:min_confidence:0.0:explicit_nudity:0.9:violence:0.9:visually_disturbing:0.9:hate_symbols:0.9:suggestive:ignore:alcohol:ignore:tobacco:ignore`. The ignore options avoid provider blanket rejection of benign swimwear/clothing/alcohol/tobacco; returned labels still require the local policy. Unknown provider categories retain provider defaults and remain held locally. The provider uses `>` thresholds; local policy explicitly implements `>=` boundaries.

Before any live activation, obtain separate approval for a benign test-account exercise, confirm add-on registration/terms/costs, verify the current provider returns structured labels on both upload and admin reconciliation, confirm anonymous originals and transformations are inaccessible, test restricted retrieval of rejected evidence and audited overrides, and validate deletion/backup behavior. Failure disables rollout; do not weaken the gates. No local fixture establishes these live account capabilities.

Dependency audit during install reported 25 advisories (including two critical entries for better-auth 1.5.6 / fast-jwt 6.1.0), whose versions were already present in the pre-photo lockfile. No direct advisory entry for the three new dependencies. Auth remediation needs a separately scoped compatibility/security pass; no forced unrelated upgrade was made here.

References: [Cloudinary image moderation](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon), [resource lookup](https://cloudinary.com/documentation/admin_api_resources_get_details_of_a_single_resource_by_public_id), [access controls](https://cloudinary.com/documentation/control_access_to_media).
