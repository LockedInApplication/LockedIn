# LockedIn Feature-Slice Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize LockedIn's journey experience into maintainable feature-based vertical slices without changing any user-visible, API, authentication, persistence, or routing behavior.

**Architecture:** Keep the current Journey route and API entrypoints as compatibility facades. Move behavior incrementally into Atlas, conversations, check-ins, roadmap, invitations, relationship-access, and journey-shell slices; preserve callback-based React orchestration and the existing Prisma/API contracts. Establish characterization tests before moving behavior-bearing code and keep the single compiled Journey CSS module while its source rules move into ordered feature partials.

**Tech Stack:** Next.js 16, React 19, TypeScript 5/6, Sass modules, Fastify 5, Prisma 7, PostgreSQL 16, Zod 4, Better Auth, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-feature-slice-refactor-design.md`

## Global Constraints

- Preserve the current UI, text, animations, routes, authentication behavior, API request/response shapes, database records, migrations, and public URLs.
- Do not redesign Prisma models or rewrite migration history.
- Do not introduce a state-management library, CSS framework, or runtime dependency unrelated to testing.
- Do not combine behavior changes with file movement.
- Keep current import paths working through compatibility facades.
- Preserve CSS cascade order, specificity, responsive behavior, and reduced-motion behavior.
- Exclude the unrelated repository-root `kickbacks.vsix` file from every commit.
- Every task must leave both applications buildable.

## Review Focus

- Concurrent Atlas definition selections and stale candidate versions must preserve both proposals and reject stale updates; covered by Task 4 service tests.
- Partner Atlas content must remain hidden until both private responses or proposals are ready; covered by Task 4 view tests.
- Same-day and future roadmap reflection dates must preserve current open/locked boundaries; covered by Tasks 2 and 7 date tests.
- Journey overview must preserve null/empty states for users without relationships or active sessions; covered by Task 8 overview tests.
- Mobile and reduced-motion Journey CSS must retain its current cascade and selectors after partial extraction; covered by Task 9 structural tests and visual comparison.

---

### Task 1: Preserve the baseline and install the test harness

**Files:**
- Modify: `apps/web/package.json`
- Modify: `services/package.json`
- Modify: package lockfiles selected by the existing npm installations
- Create: `apps/web/vitest.config.ts`
- Create: `services/vitest.config.ts`
- Create: `apps/web/src/test/test-harness.spec.ts`
- Create: `services/api/src/test/test-harness.spec.ts`

**Interfaces:**
- Consumes: existing npm workspaces as independent `apps/web` and `services` projects.
- Produces: `npm test` and `npm run test:watch` in both projects; Vitest configured for TypeScript and the web `@/` alias.

- [ ] **Step 1: Record the baseline before dependency changes**

Run:

```bash
cd apps/web && npm run lint && npm run build -- --webpack && npx tsc --noEmit
cd ../../services && npm exec tsc -- --noEmit --skipLibCheck && npm run prisma:generate
cd .. && git diff --check
```

Expected: all commands pass except the known unrelated `avatar.tsx` image optimization warning.

- [ ] **Step 2: Write failing harness tests**

Create one `describe("test harness")` test per project asserting `1 + 1 === 2`, and add `test` scripts that reference `vitest run` before Vitest is installed.

- [ ] **Step 3: Run the tests to verify the harness is unavailable**

Run: `npm test` in each project.

Expected: FAIL because `vitest` is not installed.

- [ ] **Step 4: Install and configure Vitest**

Add `vitest` as a dev dependency to both projects. Configure the web alias `@` to `apps/web/src` and use the Node environment. Add `test` and `test:watch` scripts.

- [ ] **Step 5: Run the harness tests**

Run: `npm test` in both projects.

Expected: two harness test files pass.

- [ ] **Step 6: Commit the harness separately**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/src/test services/package.json services/package-lock.json services/vitest.config.ts services/api/src/test
git commit -m "test: add journey refactor harness"
```

### Task 2: Extract stable Journey client utilities and public types

**Files:**
- Create: `apps/web/src/features/journey/journey.utils.ts`
- Create: `apps/web/src/features/journey/journey.utils.spec.ts`
- Create: `apps/web/src/features/journey/journey.client.ts`
- Create: `apps/web/src/features/journey/journey.types.ts`
- Create: `apps/web/src/features/atlas/atlas.types.ts`
- Create: `apps/web/src/features/conversations/conversation.types.ts`
- Create: `apps/web/src/features/check-ins/check-in.types.ts`
- Create: `apps/web/src/features/roadmap/roadmap.types.ts`
- Modify: `apps/web/src/lib/journey.ts`
- Modify: `apps/web/src/app/journey/workspace.tsx`

**Interfaces:**
- Consumes: current `JourneyOverview`, `JourneySession`, `AtlasWord`, and related public shapes from `lib/journey.ts`.
- Produces: `initials(name: string): string`, `formatDate(value: string | null): string | null`, `daysUntil(value: string | null, now?: Date): number`, `addDays(value: string, days: number): string`, `getProgress(overview: JourneyOverview): number`, `journeyRequest<T>(path: string, init?: RequestInit): Promise<T>`, and compatibility re-exports from `@/lib/journey`.

- [ ] **Step 1: Write failing utility characterization tests**

Test exact current outputs for initials, null date formatting, same-day `daysUntil`, future-day clamping, `addDays`, and progress values 0 through 5 using minimal `JourneyOverview` fixtures.

- [ ] **Step 2: Run the utility test to verify it fails**

Run: `cd apps/web && npm test -- journey.utils.spec.ts`

Expected: FAIL because `journey.utils.ts` does not exist.

- [ ] **Step 3: Move the current utility implementations without rewriting them**

Export the signatures above from `journey.utils.ts`; inject `now` only for deterministic tests while preserving the default current-time behavior. Move the request client and error class to `journey.client.ts`. Split types by their owning feature and build `JourneyOverview` in `journey.types.ts` from those imports.

- [ ] **Step 4: Turn `lib/journey.ts` into a compatibility facade**

Re-export all existing public names so current consumers compile unchanged, then update `workspace.tsx` to import utilities rather than defining them locally.

- [ ] **Step 5: Verify utility tests and the web build**

Run: `cd apps/web && npm test -- journey.utils.spec.ts && npm run build -- --webpack && npm run lint`

Expected: tests and build pass; lint has no new warnings.

- [ ] **Step 6: Commit the utility/type slice**

```bash
git add apps/web/src/features apps/web/src/lib/journey.ts apps/web/src/app/journey/workspace.tsx
git commit -m "refactor: extract journey client contracts"
```

### Task 3: Extract the Atlas frontend slice

**Files:**
- Create: `apps/web/src/features/atlas/atlas.state.ts`
- Create: `apps/web/src/features/atlas/atlas.state.spec.ts`
- Create: `apps/web/src/features/atlas/AtlasView.tsx`
- Create: `apps/web/src/features/atlas/AtlasLandmarkStage.tsx`
- Create: `apps/web/src/features/atlas/AtlasPrivateForm.tsx`
- Create: `apps/web/src/features/atlas/AtlasDiscovery.tsx`
- Create: `apps/web/src/features/atlas/AtlasDefinitionConvergence.tsx`
- Create: `apps/web/src/features/atlas/index.ts`
- Modify: `apps/web/src/app/journey/workspace.tsx`

**Interfaces:**
- Consumes: `AtlasWord`, `AtlasChapter`, `journeyRequest`, shared date/initial helpers, `relationshipId`, `partnerName`, `busy`, and the existing `runAction` callback signature.
- Produces: `AtlasView(props: AtlasViewProps): JSX.Element`, `getAtlasChoiceState(chapter: AtlasChapter): "awaiting-proposals" | "choosing" | "crossed" | "separate" | "mixed" | "final-draft" | "shared"`, and unchanged Atlas markup/class-name usage.

- [ ] **Step 1: Write failing Atlas state tests**

Cover awaiting proposals, both proposals ready, crossed choices, separate self-choices, mixed blend/keep-both choices, final candidate, and shared states using complete typed fixtures.

- [ ] **Step 2: Run the Atlas state tests to verify they fail**

Run: `cd apps/web && npm test -- atlas.state.spec.ts`

Expected: FAIL because `atlas.state.ts` does not exist.

- [ ] **Step 3: Implement the state helper from current inline predicates**

Move only the existing `bothProposals`, crossed-choice, and separate-choice derivation into `getAtlasChoiceState`; do not alter labels or transitions.

- [ ] **Step 4: Move Atlas components in dependency order**

Move `AtlasDefinitionConvergence`, `AtlasPrivateForm`, `AtlasDiscovery`, `AtlasLandmarkStage`, then `AtlasView`. Preserve prop types, JSX ordering, endpoint strings, success messages, local state initialization, and every `styles.*` class reference.

- [ ] **Step 5: Replace inline Atlas code with the feature export**

Import `AtlasView` into `workspace.tsx`; retain the current render branch and props exactly.

- [ ] **Step 6: Verify the Atlas slice**

Run: `cd apps/web && npm test -- atlas.state.spec.ts && npm run build -- --webpack && npm run lint`

Expected: tests/build pass and `workspace.tsx` no longer contains `function Atlas...` definitions.

- [ ] **Step 7: Commit the Atlas frontend slice**

```bash
git add apps/web/src/features/atlas apps/web/src/app/journey/workspace.tsx
git commit -m "refactor: extract atlas frontend slice"
```

### Task 4: Extract the Atlas API slice

**Files:**
- Create: `services/api/src/features/atlas/atlas.catalog.ts`
- Create: `services/api/src/features/atlas/atlas.schemas.ts`
- Create: `services/api/src/features/atlas/atlas.state.ts`
- Create: `services/api/src/features/atlas/atlas.state.spec.ts`
- Create: `services/api/src/features/atlas/atlas.view.ts`
- Create: `services/api/src/features/atlas/atlas.view.spec.ts`
- Create: `services/api/src/features/atlas/atlas.service.ts`
- Create: `services/api/src/features/atlas/atlas.routes.ts`
- Create: `services/api/src/features/relationships/relationship-access.service.ts`
- Modify: `services/api/src/routes/journey.routes.ts`

**Interfaces:**
- Consumes: the existing Prisma client, authenticated user IDs, relationship membership, Fastify server, and current Zod request bodies.
- Produces: `atlasWords`, `buildAtlasView(relationshipId: string, userId: string, partnerName: string)`, `registerAtlasRoutes(server: FastifyInstance): Promise<void>`, `resolveMeaningSelections(selections, proposals): AtlasResolution`, and `isRelationshipMember(relationshipId: string, userId: string): Promise<boolean>`.

- [ ] **Step 1: Write failing Atlas resolution tests**

Assert that equal proposal IDs select that definition, two keep-both choices preserve both strings in current order, crossed/separate/mixed choices return `RESOLVING`, and an unknown selected proposal returns the current conflict outcome.

- [ ] **Step 2: Write failing Atlas privacy/view tests**

Assert that partner response details are absent before both submit, partner proposals are absent before both propose, partner selection is absent before both select, and current-version approvals ignore older versions.

- [ ] **Step 3: Run Atlas API tests to verify they fail**

Run: `cd services && npm test -- atlas.state.spec.ts atlas.view.spec.ts`

Expected: FAIL because Atlas feature modules do not exist.

- [ ] **Step 4: Extract the catalog, schemas, and pure resolution helper**

Move values and logic exactly; keep existing keys, prompts, Zod limits, status strings, paired-definition separator, and error outcomes unchanged.

- [ ] **Step 5: Extract the Atlas view builder and service transactions**

Move Prisma queries, row locks, optimistic version checks, and state transitions without changing query ordering or response serialization.

- [ ] **Step 6: Extract and register Atlas routes**

Export `registerAtlasRoutes`; call it from `journeyRoutes` while preserving every current route path, method, status code, and error string.

- [ ] **Step 7: Verify concurrency and privacy tests**

Run: `cd services && npm test -- atlas.state.spec.ts atlas.view.spec.ts && npm exec tsc -- --noEmit --skipLibCheck`

Expected: all tests and type checking pass.

- [ ] **Step 8: Verify Prisma and live route registration**

Run: `npm run prisma:generate`, `npx prisma migrate status` from `services/api`, and an unauthenticated Fastify/curl request to a representative Atlas endpoint.

Expected: schema is current; route responds with the existing 401 rather than 404.

- [ ] **Step 9: Commit the Atlas API slice**

```bash
git add services/api/src/features/atlas services/api/src/features/relationships services/api/src/routes/journey.routes.ts
git commit -m "refactor: extract atlas api slice"
```

### Task 5: Extract conversations and check-ins on the frontend

**Files:**
- Create: `apps/web/src/features/conversations/ConversationLibrary.tsx`
- Create: `apps/web/src/features/conversations/index.ts`
- Create: `apps/web/src/features/check-ins/SessionStage.tsx`
- Create: `apps/web/src/features/check-ins/IntentionForm.tsx`
- Create: `apps/web/src/features/check-ins/RevealStage.tsx`
- Create: `apps/web/src/features/check-ins/WaitingCard.tsx`
- Create: `apps/web/src/features/check-ins/AlignmentStage.tsx`
- Create: `apps/web/src/features/check-ins/CheckInTimeline.tsx`
- Create: `apps/web/src/features/check-ins/alignment.ts`
- Create: `apps/web/src/features/check-ins/alignment.spec.ts`
- Create: `apps/web/src/features/check-ins/index.ts`
- Modify: `apps/web/src/app/journey/workspace.tsx`

**Interfaces:**
- Consumes: existing conversation/check-in types, `journeyRequest`, format helpers, busy state, `runAction`, and current navigation callbacks.
- Produces: unchanged `ConversationLibrary`, `SessionStage`, and `CheckInTimeline` entrypoints plus `alignmentBadge(item: AlignmentItem): string`.

- [ ] **Step 1: Write the failing alignment badge tests**

Assert exact labels for shared-this-time, still-shared, new-shared, changed, worth-discussing, aligned fallback, and discussion fallback.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npm test -- alignment.spec.ts`

Expected: FAIL because the feature helper does not exist.

- [ ] **Step 3: Move the alignment helper and components**

Move components in leaf-first order while preserving all form field names, endpoint paths, request bodies, copy, option ordering, consent behavior, and class names.

- [ ] **Step 4: Replace inline definitions with feature imports**

Keep the same `activeView` branch order and callbacks in `workspace.tsx`.

- [ ] **Step 5: Verify conversations/check-ins**

Run: `cd apps/web && npm test -- alignment.spec.ts && npm run build -- --webpack && npm run lint`

Expected: tests/build pass and no conversation/check-in component functions remain in `workspace.tsx`.

- [ ] **Step 6: Commit the frontend slices**

```bash
git add apps/web/src/features/conversations apps/web/src/features/check-ins apps/web/src/app/journey/workspace.tsx
git commit -m "refactor: extract conversation and check-in ui"
```

### Task 6: Extract conversations and check-ins on the API

**Files:**
- Create: `services/api/src/features/conversations/conversation.catalog.ts`
- Create: `services/api/src/features/conversations/conversation.schemas.ts`
- Create: `services/api/src/features/conversations/conversation.routes.ts`
- Create: `services/api/src/features/conversations/conversation.service.ts`
- Create: `services/api/src/features/check-ins/alignment.ts`
- Create: `services/api/src/features/check-ins/alignment.spec.ts`
- Create: `services/api/src/features/check-ins/check-in.schemas.ts`
- Create: `services/api/src/features/check-ins/check-in.view.ts`
- Create: `services/api/src/features/check-ins/check-in.routes.ts`
- Create: `services/api/src/features/check-ins/check-in.service.ts`
- Modify: `services/api/src/routes/journey.routes.ts`

**Interfaces:**
- Consumes: relationship access service, Prisma, Fastify, notification service, and unchanged catalog values.
- Produces: `conversationPacks`, `getConversationPack(packKey?: string)`, `buildAlignment`, `addAlignmentTrends`, `buildCheckInSnapshot`, `buildSessionView`, `registerConversationRoutes`, and `registerCheckInRoutes`.

- [ ] **Step 1: Write failing alignment/trend tests**

Pin exact option labels, context visibility, aligned classification, new-shared/still-shared/shared-this-time transitions, changed answers, and worth-discussing fallbacks.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd services && npm test -- alignment.spec.ts`

Expected: FAIL because the check-in alignment module does not exist.

- [ ] **Step 3: Extract catalogs, schemas, and pure alignment functions**

Move current values and functions unchanged, including question and option ordering.

- [ ] **Step 4: Extract check-in views/services and routes**

Preserve reveal consent, private context filtering, active session selection, archive behavior, conversation-choice matching, transactions, response shapes, and notification calls.

- [ ] **Step 5: Register feature routes from the journey composer**

Remove moved route bodies only after the new registrations compile.

- [ ] **Step 6: Verify API behavior**

Run: `cd services && npm test -- alignment.spec.ts && npm exec tsc -- --noEmit --skipLibCheck && npm run prisma:generate`

Expected: all commands pass.

- [ ] **Step 7: Commit the API slices**

```bash
git add services/api/src/features/conversations services/api/src/features/check-ins services/api/src/routes/journey.routes.ts
git commit -m "refactor: extract conversation and check-in api"
```

### Task 7: Extract roadmap frontend and API slices

**Files:**
- Create: `apps/web/src/features/roadmap/RoadmapView.tsx`
- Create: `apps/web/src/features/roadmap/NextStepForm.tsx`
- Create: `apps/web/src/features/roadmap/ProposalChoices.tsx`
- Create: `apps/web/src/features/roadmap/ProposalHistory.tsx`
- Create: `apps/web/src/features/roadmap/RoadmapSteps.tsx`
- Create: `apps/web/src/features/roadmap/AcceptedStep.tsx`
- Create: `apps/web/src/features/roadmap/ReflectionForm.tsx`
- Create: `apps/web/src/features/roadmap/index.ts`
- Create: `services/api/src/features/roadmap/roadmap.schemas.ts`
- Create: `services/api/src/features/roadmap/roadmap.dates.ts`
- Create: `services/api/src/features/roadmap/roadmap.dates.spec.ts`
- Create: `services/api/src/features/roadmap/roadmap.view.ts`
- Create: `services/api/src/features/roadmap/roadmap.service.ts`
- Create: `services/api/src/features/roadmap/roadmap.routes.ts`
- Modify: `apps/web/src/app/journey/workspace.tsx`
- Modify: `services/api/src/routes/journey.routes.ts`

**Interfaces:**
- Consumes: journey/check-in types, Prisma, Fastify, relationship access, format/date helpers, `runAction`, and busy state.
- Produces: `RoadmapView`, `reflectionOpensAt(targetDate: Date | null, now?: Date): Date | null`, `nextStepView`, and `registerRoadmapRoutes`.

- [ ] **Step 1: Write failing reflection-date tests**

Assert null dates, future dates, same-day midnight behavior, and current `reflectionAvailable` outcomes with an injected fixed clock.

- [ ] **Step 2: Run date tests to verify they fail**

Run: `cd services && npm test -- roadmap.dates.spec.ts`

Expected: FAIL because `roadmap.dates.ts` does not exist.

- [ ] **Step 3: Extract the roadmap frontend components leaf-first**

Preserve form values, date calculations, reflection locks, proposal ordering, request bodies, success messages, and class names.

- [ ] **Step 4: Extract roadmap schemas, dates, views, services, and routes**

Preserve proposal acceptance/decline behavior, multiple accepted steps, target-date normalization, reflection privacy, status transitions, and response shapes.

- [ ] **Step 5: Verify roadmap slices**

Run:

```bash
cd apps/web && npm run build -- --webpack && npm run lint
cd ../../services && npm test -- roadmap.dates.spec.ts && npm exec tsc -- --noEmit --skipLibCheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit roadmap slices**

```bash
git add apps/web/src/features/roadmap apps/web/src/app/journey/workspace.tsx services/api/src/features/roadmap services/api/src/routes/journey.routes.ts
git commit -m "refactor: extract roadmap slices"
```

### Task 8: Extract invitations, overview aggregation, and the Journey shell

**Files:**
- Create: `apps/web/src/features/invitations/ConnectionStage.tsx`
- Create: `apps/web/src/features/invitations/index.ts`
- Create: `apps/web/src/features/journey/JourneyWorkspace.tsx`
- Create: `apps/web/src/features/journey/components/WorkspaceHeader.tsx`
- Create: `apps/web/src/features/journey/components/WorkspaceNav.tsx`
- Create: `apps/web/src/features/journey/components/ProgressRail.tsx`
- Create: `apps/web/src/features/journey/components/SharedJourneyPath.tsx`
- Create: `apps/web/src/features/journey/components/EmptyWorkspace.tsx`
- Create: `services/api/src/features/invitations/invitation.schemas.ts`
- Create: `services/api/src/features/invitations/invitation.service.ts`
- Create: `services/api/src/features/invitations/invitation.routes.ts`
- Create: `services/api/src/features/journey/overview.service.ts`
- Create: `services/api/src/features/journey/overview.service.spec.ts`
- Create: `services/api/src/features/journey/journey.routes.ts`
- Create: `services/api/src/features/journey-notifications/journey-email.service.ts`
- Modify: `apps/web/src/app/journey/workspace.tsx`
- Modify: `services/api/src/routes/journey.routes.ts`

**Interfaces:**
- Consumes: all feature entrypoints and view builders created in Tasks 2–7.
- Produces: `JourneyWorkspace`, `buildJourneyOverview(userId: string): Promise<JourneyOverviewPayload>`, and composed `journeyRoutes(server: FastifyInstance)` while keeping current facade exports.

- [ ] **Step 1: Write failing overview empty-state tests**

Using controlled repository/service dependencies, assert no-relationship users receive `relationship: null`, `session: null`, null conversation selection, empty history, default Atlas words, and pending invitations unchanged.

- [ ] **Step 2: Run the overview tests to verify they fail**

Run: `cd services && npm test -- overview.service.spec.ts`

Expected: FAIL because `overview.service.ts` does not exist.

- [ ] **Step 3: Extract invitation frontend/API code**

Preserve invite generation, copy-to-clipboard behavior, acceptance flow, expiration handling, emails, error messages, and response shape.

- [ ] **Step 4: Extract the overview service and composed API plugin**

Build the payload from existing feature view builders in the current query/order semantics. Keep `routes/journey.routes.ts` as a one-line compatibility export.

- [ ] **Step 5: Extract the Journey shell**

Move loading, auth redirect, invitation token handling, notices, sign-out, active view state, and feature composition to `JourneyWorkspace.tsx`. Keep `app/journey/workspace.tsx` as a default re-export.

- [ ] **Step 6: Verify the composed system**

Run:

```bash
cd apps/web && npm test && npm run build -- --webpack && npm run lint
cd ../../services && npm test && npm exec tsc -- --noEmit --skipLibCheck && npm run prisma:generate
```

Expected: all tests/builds pass; compatibility files contain no domain implementation.

- [ ] **Step 7: Commit invitations and composition**

```bash
git add apps/web/src/features/invitations apps/web/src/features/journey apps/web/src/app/journey/workspace.tsx services/api/src/features/invitations services/api/src/features/journey services/api/src/features/journey-notifications services/api/src/routes/journey.routes.ts
git commit -m "refactor: compose journey feature slices"
```

### Task 9: Split Journey Sass into ordered feature-owned partials

**Files:**
- Create: `apps/web/src/features/journey/styles/_journey-shell.scss`
- Create: `apps/web/src/features/invitations/styles/_invitations.scss`
- Create: `apps/web/src/features/conversations/styles/_conversations.scss`
- Create: `apps/web/src/features/check-ins/styles/_check-ins.scss`
- Create: `apps/web/src/features/atlas/styles/_atlas.scss`
- Create: `apps/web/src/features/roadmap/styles/_roadmap.scss`
- Create: `apps/web/src/features/journey/styles/style-structure.spec.ts`
- Modify: `apps/web/src/app/journey/journey.module.scss`

**Interfaces:**
- Consumes: all existing Journey class selectors and media/keyframe blocks.
- Produces: the same `styles.<className>` CSS-module exports and compiled cascade, with the root module acting as an ordered Sass entrypoint.

- [ ] **Step 1: Capture baseline visual references**

Capture representative authenticated Journey states at current desktop and mobile widths before moving rules. Record reduced-motion CSS behavior. If browser capture is unavailable, record the compiled CSS checksum and selector/media-query inventory instead.

- [ ] **Step 2: Write failing style-structure tests**

Assert that the planned six partials exist, the root module imports them in the required order, all current locally referenced class names remain present in the compiled module, and mobile/reduced-motion media blocks remain present.

- [ ] **Step 3: Run the structural test to verify it fails**

Run: `cd apps/web && npm test -- style-structure.spec.ts`

Expected: FAIL because feature style partials do not exist.

- [ ] **Step 4: Move rules mechanically while preserving source order**

Move complete selector blocks, their related keyframes, and responsive overrides together. Do not rename classes, merge declarations, change values, or reorder imports.

- [ ] **Step 5: Verify CSS structure and production build**

Run: `cd apps/web && npm test -- style-structure.spec.ts && npm run build -- --webpack && npm run lint`

Expected: structural tests/build pass with no missing CSS-module exports.

- [ ] **Step 6: Compare visual references**

Repeat the Task 9 Step 1 capture method. Expected: no layout, typography, color, spacing, responsive, or reduced-motion differences.

- [ ] **Step 7: Commit the style slices**

```bash
git add apps/web/src/features/*/styles apps/web/src/app/journey/journey.module.scss
git commit -m "refactor: split journey styles by feature"
```

### Task 10: Final integration verification and architecture audit

**Files:**
- Modify only if verification exposes an extraction defect.
- Review: all files under `apps/web/src/features/` and `services/api/src/features/`.

**Interfaces:**
- Consumes: every prior task deliverable.
- Produces: verified behavior-preserving feature-slice architecture and a clean handoff.

- [ ] **Step 1: Run the complete automated verification matrix**

```bash
cd apps/web
npm test
npm run lint
npx tsc --noEmit
npm run build -- --webpack

cd ../../services
npm test
npm exec tsc -- --noEmit --skipLibCheck
npm run prisma:generate
cd api && npx prisma migrate status

cd ../..
git diff --check
```

Expected: all commands pass; only the pre-existing `avatar.tsx` image warning may remain.

- [ ] **Step 2: Audit file size and dependency direction**

Run line counts for Journey feature files and search imports for cycles or cross-feature internals.

Expected: no product file exceeds roughly 500 lines without a documented reason; features import public entrypoints/types, not another feature's internal components.

- [ ] **Step 3: Verify local and public runtime health**

Check web `/journey`, API `/api/journey/overview`, public ngrok `/journey`, and a representative new Atlas route.

Expected: web/public routes return 200; unauthenticated API requests preserve current 401 behavior; authenticated overview remains 200.

- [ ] **Step 4: Review the complete diff for behavior changes**

Confirm no Prisma migration/schema change, no API route/path/method change, no text change, no endpoint string change, and no CSS value change beyond file movement.

- [ ] **Step 5: Commit verification-only fixes if any**

```bash
git add <only-files-changed-by-verification>
git commit -m "fix: preserve journey behavior after extraction"
```

- [ ] **Step 6: Request final code review before integration**

Use `superpowers:requesting-code-review` against the complete refactor and resolve only verified findings through the receiving-review workflow.
