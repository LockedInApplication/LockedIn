# Optional discovery pilot alongside LockedIn

Status: approved by the user on 2026-11-16, including the avatar-only pilot, manual areas, three concurrent starters, and the transition rule below. No discovery product code or migration has been implemented. Detailed implementation choices below remain attributed to the builder, not independently supplied by the user.

## Intent

Give a person a useful path forward when another person is not participating, and let people meet before mutually choosing to build together. Discovery supplements the existing private relationship workspace; it does not replace it or claim that nearby people are compatible.

## Approved workflow and approach

The user selected the staged approach after considering (a) several exploratory connections followed by a mutually chosen deeper LockedIn journey and (b) a full LockedIn journey for every accepted connection. Approach (a) is selected: it keeps the current product recognizable and avoids immediately making every deep journey multi-partner. Approach (b) remains a broader future refactor, not part of this pilot.

The flow is: explicitly opt into discovery; publish deliberately chosen profile information; select a broad area; explore opted-in people through an illustrative radar or profile list; invite one person to a starter question; recipient accepts or declines; accepted people use their own separate starter conversation; either person can close it; both must choose Build together before any deeper shared space is created. A pending reply never blocks unrelated exploratory conversations. Discovery can be paused without erasing existing work.

## Approved boundary for existing shared-space users

The existing invitation services prohibit a second active relationship, and the journey overview selects one active relationship. An existing Leave shared space button calls `/api/journey/relationships/:relationshipId/leave` and sets the relationship to ENDED for both people. This is not a discovery-only disconnect, and a complete read-only ended-space history experience has not been verified. Merely enabling multiple ACTIVE relationships would select the wrong context and risk mixing activity.

**Alternative considered, not selected:** only accounts without an existing ACTIVE shared space could publish a discovery profile or send/accept new discovery invitations. This would bound the initial release, but would exclude existing users with a stalled shared space from exploration.

**Selected:** allow existing connected users to opt in and have exploratory conversations, while keeping their existing deep space intact. Build together with someone else remains unavailable while either person has a different ACTIVE relationship. The existing explicit Leave shared space action is the only available way to end that space; discovery never calls it, suggests the old data is deleted, or changes its meaning. If this leaves an awkward transition, improve the exit/history experience in an explicitly approved separate slice rather than invent a silent replacement.

No one is automatically made discoverable, relabeled as exclusive, disconnected, or migrated.

## Goals

- Opt-in, authenticated, adult-only pilot with a small operator-approved cohort.
- Several separate starter connections, each with clear pending/accepted/closed states.
- Public fields are separate from private profile settings, email, reflections, and journey answers.
- Broad, manually selected areas, with a radar that explicitly does not represent coordinates, distance, direction, or movement.
- Safe decline, withdrawal, close, block, report, and pause controls before real stranger discovery is enabled.
- An atomic mutual transition into the current LockedIn workspace without overwriting any existing relationship.
- Existing direct invitations, settings, private answers, notifications, Atlas chapters, roadmaps, and history continue working.

## Non-goals

No Bluetooth scanning, actual device geolocation, background location access, exact distance, online/last-seen tracking, compatibility score, public feed, public message access, paid discovery, or public launch. No automatic answer sharing, exclusivity, copying old private answers into new connections, or automatic closure of other conversations. No changes to marketing promises based on unmeasured engagement assumptions.

## Approved pilot scope and builder defaults

- Feature disabled by default, plus a server-side account cohort allowlist. A frontend flag alone is insufficient. No live enablement or deployment is authorized by approval of the design.
- Adults self-attest 18+ and use a verified-email account. Self-attestation is not identity or age verification; the UI and operator runbook must not claim otherwise. No numeric age or birthdate is published in this first slice.
- A profile contains a chosen public name, existing avatar preset, short bio, relationship intention, interests, optional communication pace, broad area, and publication consent. Public previews show exactly what will be published. Identity verification badges are not invented.
- The visual prototype's photos are not a built upload system. Use existing avatars in the first code slice, as approved. Photo uploads require durable storage, consent/removal behavior and moderation before introduction and are deferred.
- Three concurrent pending/accepted starter connections per person, excluding closed/declined/expired records. Pending invitations expire after seven days. The three-starter cap is approved; seven-day expiry is a builder default. Close/withdraw should free capacity without erasing the other participant's historical record.
- Decline closes the invitation quietly and uses a seven-day directional re-invitation pause; it is not proof of a block. No repeated reminders or forced reasons. A block overrides invitation/connection eligibility in both directions.
- Starter conversations are text-only and centered on one chosen question, with an optional short invitation hello. A personal response is drafted privately, and only an explicit Share action publishes a response snapshot to that pair. No read receipts or automatic sharing. Once shared, UI must not suggest a recipient can be made to unsee it.
- The avatar-only starter pilot uses no external service account, storage purchase, real test invitation, live-user message, or production database mutation during implementation verification.

## Public discovery and location behavior

Users choose an area from an operator-configured pilot catalog. Store an area identifier, not coordinates. Candidate selection intersects publication consent, pilot eligibility, adulthood attestation, same selected area, and stated relationship intention; excludes self, suspended accounts, blocks in either direction, and existing pending/accepted pairs. Areas lacking real candidates show an honest empty state—never synthetic live people, invented counts, or an automatically broadened search.

The radar is a stable, illustrative arrangement of returned candidates with a visible not-exact-position note. Its accessible profile list exposes the same candidates and actions. A refresh does not invent arrivals or imply a Bluetooth/GPS scan. The demo's sample people do not ship as production account data. No public directory or email search is added.

Publishing requires an explicit final action; saving a draft does not publish. Pausing removes a person from new candidate results and invalidates new invitation attempts from stale cards, but leaves their existing pending invitations and accepted connections available. A paused sender cannot initiate a new invitation until resuming. Server checks enforce consent at mutation time, not just card rendering.

## Starter connection model and isolation

Add a feature-owned discovery domain rather than overloading RelationshipInvite or returning arbitrary ACTIVE relationships. Separate entities cover public profile/publication, canonical account-pair starter connection, participant draft and shared response snapshots, block/report records, and per-user readiness to build. Persist invitation and readiness consent versions so closing a connection or changing its consent contract cannot reuse stale consent.

An invitation's question, hello, and sender name/avatar snapshot are immutable once sent. Editing the invitation requires withdrawal and a new send subject to normal throttles. The snapshot contains only fields already explicitly made public and is labeled as the invitation's send-time identity; current public details can be reviewed separately. Profile publication copy must explain that recipients retain the invitation information deliberately sent to them. No private profile email, draft, or reflection enters the snapshot.

Editing a public bio/name/avatar/intention updates future discovery/profile views, not previously sent invitations or accepted starter topics. Existing accepted conversations remain bound to stable account IDs. Public-profile edits alone do not silently revoke readiness to open a workspace with that same account: readiness is consent to the explicit pair-and-space action, not a guarantee that profile text is immutable. Changing the readiness contract or closing/blocking/suspending the connection invalidates the current readiness version; unblocking never restores it. Pause/resume has the previously described publication-only behavior. Recheck current safety/eligibility at accept and promotion regardless of snapshots.

Every lookup and mutation requires current account identity, feature/cohort eligibility and appropriate participant membership. Public profile payloads are allowlisted; no full user object is serialized. Notification routes expose only recipient-owned tasks. Discovery connections do not inherit either participant's existing private answers or permission to view existing relationship records.

Transactional pair/user locks must prevent opposite-direction duplicate invitations, exceeding connection limits, accept-after-close/block races, and duplicate promotions. Stale/retried actions return their current state without extending decline cooldowns or generating duplicate notifications. Relationship membership checks remain mandatory even for linked/promoted connections.

## Build together transition

Readiness is an explicit, revocable per-person choice in an accepted starter connection. Clicking it once does not create a relationship, imply exclusivity, pause a partner's discovery, or end other connections. Before each readiness choice, show that it opens a deeper shared LockedIn space and does not automatically share earlier private drafts.

When both current readiness choices exist, lock both accounts and the connection, recheck connection status, blocks/suspensions, feature eligibility, and the existing one-active-shared-space restriction. Create exactly one Relationship with exactly these two members and link it to the starter connection in the same transaction. Never modify or reuse a different pair's Relationship. If eligibility changed, return a neutral unavailable result without exposing someone else's relationship identity or private activity.

Promotion keeps the starter history in its original authorized connection. It does not import answers into Atlas, existing intention responses, or roadmap proposals. The pair can navigate between their starter history and their new /journey workspace. Other starter conversations remain separate and are not silently closed; pausing discovery remains each user's own explicit choice. Existing membership/notification workflows continue using the same relationship IDs they had before rollout.

## Safety and reporting

Existing invitation-only blocking is not a complete stranger-discovery safety system. Discovery blocking must remove pair visibility in both directions, invalidate new/pending pair invitations, and stop new writes/readiness in accepted starter connections. Block status, reasons, reporter identity, and internal reports are never exposed to the other user or in public notifications. Unblocking cannot reopen a closed connection or restore readiness.

Either participant may close an exploratory connection without the other's approval. Closing invalidates pending readiness and new submissions; private drafts remain owner-only. Previously shared text remains readable by its original participants as read-only history, unless account moderation requires access suppression. Closing is not described as deleting the other person's copy. No generic block action ends an existing deeper Relationship as a side effect.

Reports must persist a restricted evidence snapshot and reason, give a receipt without promising an unstaffed response time, and be reviewable through authenticated server-side operator authorization separate from ordinary user access. Reporting and blocking are separate actions, with an optional combined control. Do not rely on invitation blocking alone to prevent discovery contact or expose report evidence in ordinary responses.

A local-first operator review tool may reuse the current authenticated session and a configured moderator account allowlist, provided all reads/actions are separately authorized server-side and audited. This is a builder choice; the operator must assign real moderators before pilot enablement. Without assigned reporting coverage, discovery must remain disabled.

Abuse controls must include server-side account/action throttles, input validation and text limits, escaped rendering, neutral account-unavailable errors, and authenticated mutation origin protections matching the existing app. Avoid leaking other profiles through counts, IDs, notifications, or stale cached responses.

## Mobile and navigation

Use the approved compact mockup as a reference, not production source or security policy. Keep the existing journey header and account controls, and add authenticated Discover and Connections destinations without forcing existing users away from their shared space. Add a clear optional discovery entry for eligible accounts. Keep the primary invitation or conversation action visible without a long introductory block.

Navigation between exploratory connections must protect unsaved drafts and never show the previous account's or previous connection's response while loading. Deep links and notification clicks open the precise invitation or connection; they never guess the first active relationship. Public profile, invitation review, starter conversation, and shared journey have explicit context labels.

Standalone personal reflection is included in the pilot, as shown in the approved waiting experience. It must not repurpose shared intention responses: use a separate owner-only store with no discovery serialization or participant access. The existing private notes embedded in a shared journey remain unchanged. There is no automatic import of private reflection into a connection, public profile, or deeper journey.

## Notifications

Reuse existing notification infrastructure through feature-owned discovery event kinds. New invitation, acceptance, shared starter response, and readiness/promotion should create deduplicated recipient tasks honoring existing in-app preferences. Decline, close, block, or reporting must not produce pressure-generating push/email messages. Do not expose private draft content or publicize discovery visibility. No new email campaign or real-user notification is authorized for testing.

Paused visibility does not stop notifications for existing accepted connections. A stale connection notification is resolved safely and does not grant membership or reopen a closed/blocked connection. Avoid changing notification preferences or legacy invitation behavior just to enable the pilot.

## Migration and rollout

Use additive schema changes with default unpublished/ineligible discovery state. Do not backfill existing accounts into publication, build readiness, or new relationships. Preserve every existing account, relationship ID, member, private response, reveal choice, next step, notification and chapter history. Do not reset any database or auto-apply migrations to production during implementation.

Implement and test against controlled fixture accounts in an isolated test database. Before any later production release, record backup/recovery and migration checks, assign moderators and a pilot cohort, review consent copy, and explicitly approve the rollout. Turning off new discovery must stop publication/search/new invitations while allowing existing starter participants to access their history and safety controls. It must never break the pre-existing journey. Separate new-entry eligibility from ongoing participant authorization so disabling the rollout does not strand data or remove access to blocking/reporting.

## Verification requirements

- Existing API and web suites remain green; current direct invitation and journey behavior stays unchanged with discovery disabled.
- Add authorization tests for nonmembers, the other participant's drafts, account switching, public profile field leaks, and guessed connection/report/notification IDs.
- Add real database tests for duplicate/opposing invites, caps, expiry and cooldown boundaries, concurrent accept/close/block/promotion, immutable invitation topic/snapshot handling, public edits versus existing invitation behavior, and stale readiness consent.
- Check that no coordinates, private emails, existing relationship answers, or reporter details appear in public payloads or candidate counts.
- Verify pause/resume, withdrawn/declined/blocked/stale cards, reporting moderation, disconnect history access, one-sided readiness and exactly-once pair promotion.
- Verify schema/migration preservation on representative existing shared-space fixtures, including active and archived sessions, chapter approvals and notification preferences.
- Browser-test two or more isolated accounts through publication, area selection, radar/list, invitation accept/decline, parallel starter connections, separate drafts, explicit sharing, owner-only reflections, block/report/close, and mutual build. Use synthetic identities and intercepted delivery; no real account/profile/contact writes.
- Phone layouts at 320/393/430px and desktop; usable touch targets, keyboard navigation, clear context, honest empty states, reduced-motion support, and no exact-position presentation.

## Not authorized by this document

Creating external accounts or paid services, publishing profiles for existing users, inviting real people, enabling or publicly launching the pilot, changing production database contents, merging, pushing, or deployment. Those require the corresponding user instruction. The existing uncommitted header alignment work remains a separate change and must be preserved.

## Builder check disposition

A fresh read-only reviewer identified three material questions: eligibility while an existing shared space is active; whether standalone reflection is included; and how profile/topic edits affect pending invitations/readiness. The user approved exploration while connected with new deep-space creation blocked until the old space is explicitly ended. Standalone reflection is mandatory. Immutable invitation snapshots and pair-specific readiness rules settle the third question as builder choices. No discovery code has been written.
