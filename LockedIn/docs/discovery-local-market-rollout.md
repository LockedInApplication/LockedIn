# Local Discovery rollout

Location policy applies to new Discovery browsing and invitations, including pending acceptance. Existing chats, connected profiles, shared spaces, and direct invitations continue to use their existing rules. Profile city and legacy distance preferences are not location evidence.

## Worldwide nearby mode

1. Deploy the compatible API and web build without changing the existing location settings. No new migration or backfill is needed.
2. On the **staging API**, set `DISCOVERY_LOCATION_MODE=worldwide`, `DISCOVERY_LOCATION_GENERATION=worldwide-v1` (or another fresh identifier), and `DISCOVERY_ACCESS_MODE=open`. Keep `DISCOVERY_ENABLED=true` and the staffed `DISCOVERY_MODERATOR_USER_IDS` list. Preserve city and verified-market settings for rollback; worldwide matching does not use them. Both mode and generation are required; a missing or invalid setting stops new Discovery.
3. With two eligible, verified test accounts, confirm that a previously published profile can browse without republishing, a new profile can publish without a city, nearby candidates can invite and accept, and a distant or expired check cannot browse or accept. Deny location permission and verify that Inbox, a direct invitation, and pausing stay available. Recheck from a different area and verify fresh results; test on a phone and desktop. If there is no hosted staging, record the same checks locally before deciding whether to activate production.
4. Once the new API and web deployment are verified and rollout is approved, enable the same settings on the **production API**, with a fresh production generation. Changes to environment settings do not alter Git branches. Verify the production flow without using or modifying other members’ accounts.

To roll back, stay on compatible builds and set `DISCOVERY_LOCATION_MODE=metro` with a **new** `DISCOVERY_LOCATION_GENERATION` and a reviewed city/market catalog. Do not remove the mode or reuse an earlier generation. Old checks become invalid after a switch. Members who published a neutral “Nearby” profile may choose a supported city and republish before confirming again. Existing chats and published data are preserved.

Worldwide checks retain only one coarse cell and expiry per profile. The row stops qualifying after 24 hours and is replaced on the next successful check or removed with the profile. Submitted coordinates are not stored or sent to a geocoder. Keep location-check request bodies out of logging and analytics.

## Legacy metro mode

Both people need a current check for the same configured metro.

1. Apply the additive `20261118003000_discovery_location_check` migration from services with `npm run prisma -- migrate deploy`. No backfill is needed.
2. Deploy the compatible web and API builds with `DISCOVERY_LOCATION_REQUIRED=false`. Configure reviewed metro centers and radii in `DISCOVERY_VERIFIED_MARKETS_JSON` on the API. Every `areaId` must appear in `DISCOVERY_AREAS_JSON`. Example for a local test where the area catalog includes `new-york`: `[{"areaId":"new-york","latitude":40.75,"longitude":-73.99,"radiusKm":40}]`. Review real coverage (including visitors and metro boundaries) before using example values with users.
3. Turn on `DISCOVERY_LOCATION_REQUIRED=true` for a test environment first. A missing or invalid market catalog disables new local Discovery rather than allowing remote browsing. On phone and desktop, confirm permission denial, out-of-area checks, eligible local browsing, and a successful check after travel. Check that existing messages and the direct-invite flow still work with location denied. Enabling the gate makes all affected users confirm before being shown to others.
4. Only on installs that have never switched to worldwide, disabling the legacy flag restores the earlier city/distance behavior. A worldwide rollback must use the compatible metro procedure above.

The browser asks on a user gesture, without background tracking. The API discards precise coordinates after matching and stores one metro and expiration per profile, with no location history. A check is valid for 24 hours; users can update it on arrival or after moving. An expired row is ignored until it is replaced, cleared by an out-of-area check, or deleted with the profile. Do not capture request bodies for the location-check endpoint in observability tools.

This stops manual remote city selection, not location spoofing. Browser coordinates are client-provided. It does not use citizenship, IP geolocation, or a VPN flag as a veto.
