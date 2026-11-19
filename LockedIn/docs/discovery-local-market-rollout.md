# Local Discovery rollout

This gate applies to new Discovery browsing and invitations, including pending acceptance. Both people need a current check for the same configured metro. Existing chats, connected profiles, shared spaces, and direct invitations continue to use their existing rules. Profile city and legacy distance preferences are not location evidence.

1. Apply the additive `20261118003000_discovery_location_check` migration from services with `npm run prisma -- migrate deploy`. No backfill is needed.
2. Deploy the compatible web and API builds with `DISCOVERY_LOCATION_REQUIRED=false`. Configure reviewed metro centers and radii in `DISCOVERY_VERIFIED_MARKETS_JSON` on the API. Every `areaId` must appear in `DISCOVERY_AREAS_JSON`. Example for a local test where the area catalog includes `new-york`: `[{"areaId":"new-york","latitude":40.75,"longitude":-73.99,"radiusKm":40}]`. Review real coverage (including visitors and metro boundaries) before using example values with users.
3. Turn on `DISCOVERY_LOCATION_REQUIRED=true` for a test environment first. A missing or invalid market catalog disables new local Discovery rather than allowing remote browsing. On phone and desktop, confirm permission denial, out-of-area checks, eligible local browsing, and a successful check after travel. Check that existing messages and the direct-invite flow still work with location denied. Enabling the gate makes all affected users confirm before being shown to others.
4. Disable the flag to restore the earlier city/distance behavior. No new location data needs to be dropped for rollback.

The browser asks on a user gesture, without background tracking. The API discards precise coordinates after matching and stores one metro and expiration per profile, with no location history. A check is valid for 24 hours; users can update it on arrival or after moving. An expired row is ignored until it is replaced, cleared by an out-of-area check, or deleted with the profile. Do not capture request bodies for the location-check endpoint in observability tools.

This stops manual remote city selection, not location spoofing. Browser coordinates are client-provided. It does not use citizenship, IP geolocation, or a VPN flag as a veto.
