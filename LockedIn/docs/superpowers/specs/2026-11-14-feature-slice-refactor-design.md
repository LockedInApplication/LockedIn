# LockedIn Feature-Slice Refactor Design

## Intent

Refactor LockedIn from three journey-related monoliths into feature-based vertical slices without changing product behavior. The work must preserve the current UI, text, animations, routes, authentication behavior, API request and response shapes, database records, migrations, and public URLs.

The immediate motivation is maintainability. The current journey workspace combines unrelated features in files that are too large to reason about safely:

- `apps/web/src/app/journey/workspace.tsx`: 2,123 lines
- `apps/web/src/app/journey/journey.module.scss`: 3,046 lines
- `services/api/src/routes/journey.routes.ts`: 1,768 lines

## Goals

- Give Atlas, conversations, check-ins, roadmap, and invitations clear ownership boundaries.
- Make the route and page entrypoints thin composition layers.
- Keep files focused enough to review and test independently.
- Preserve all existing database and HTTP contracts.
- Add characterization tests before moving domain logic.
- Make later feature work local to one feature slice whenever practical.
- Keep the current local and ngrok development workflow working.

## Non-goals

- No visual redesign, copy changes, animation changes, or accessibility behavior changes.
- No API renaming, URL changes, response reshaping, or authentication changes.
- No Prisma model redesign or migration rewrite.
- No dependency or framework migration.
- No performance optimization unless required to preserve current behavior.
- No cleanup of unrelated landing-page or authentication code.
- No conversion to a new state-management library or CSS framework.

## Anti-goals

The refactor is unsuccessful if it produces a cleaner folder tree while making a feature harder to understand, silently changes behavior, duplicates domain logic, or creates a generic abstraction that exists only to reduce line count.

## Constraints

- The current Atlas implementation and migrations are uncommitted and must be preserved.
- Existing user data must remain readable without transformation.
- The app currently has no first-party automated test suite, so characterization coverage must be introduced before risky moves.
- All current builds, lint checks, Prisma generation, and migration status checks must continue to pass.
- Style extraction must preserve CSS cascade order, specificity, responsive behavior, and reduced-motion behavior.
- The refactor must work in small, independently verifiable checkpoints.

## Approaches Considered

### 1. Feature-based vertical slices — selected

Group frontend components, frontend types, API routes, validation, domain services, and tests by product capability. Keep thin journey composition layers for the overview endpoint and workspace shell.

This creates the strongest long-term ownership and makes future changes to Atlas or roadmap logic local to those features. It requires careful handling of cross-feature overview aggregation and shared relationship access.

### 2. Technical-layer extraction

Split components, routes, schemas, and services into separate top-level technical directories. This is easier initially, but a single feature remains spread across the repository and future changes still require broad navigation.

### 3. Hotspot-only extraction

Extract Atlas and leave other journey concerns in their current files. This reduces immediate risk but leaves competing architectures and does not fulfill the codebase-level modularization goal.

## Target Architecture

### Frontend

The existing route remains at `apps/web/src/app/journey/page.tsx`. The existing `workspace.tsx` becomes a compatibility entrypoint that re-exports the feature shell so route imports and runtime behavior stay stable.

```text
apps/web/src/features/journey/
  JourneyWorkspace.tsx
  journey.types.ts
  journey.client.ts
  journey.utils.ts
  components/
    WorkspaceHeader.tsx
    WorkspaceNav.tsx
    ProgressRail.tsx
    SharedJourneyPath.tsx
    EmptyWorkspace.tsx
  styles/
    journey-shell.scss

apps/web/src/features/invitations/
  ConnectionStage.tsx
  invitation.types.ts
  styles/invitations.scss

apps/web/src/features/conversations/
  ConversationLibrary.tsx
  conversation.types.ts
  styles/conversations.scss

apps/web/src/features/check-ins/
  SessionStage.tsx
  IntentionForm.tsx
  RevealStage.tsx
  WaitingCard.tsx
  AlignmentStage.tsx
  CheckInTimeline.tsx
  check-in.types.ts
  alignment.ts
  styles/check-ins.scss

apps/web/src/features/atlas/
  AtlasView.tsx
  AtlasLandmarkStage.tsx
  AtlasPrivateForm.tsx
  AtlasDiscovery.tsx
  AtlasDefinitionConvergence.tsx
  atlas.types.ts
  atlas.state.ts
  styles/atlas.scss

apps/web/src/features/roadmap/
  RoadmapView.tsx
  NextStepForm.tsx
  ProposalChoices.tsx
  ProposalHistory.tsx
  RoadmapSteps.tsx
  AcceptedStep.tsx
  ReflectionForm.tsx
  roadmap.types.ts
  styles/roadmap.scss
```

`JourneyWorkspace.tsx` owns only data loading, authentication redirect, notices, the active top-level view, and composition of feature entrypoints. Feature components continue receiving data and action callbacks through props so this refactor does not introduce a new state library.

`apps/web/src/lib/journey.ts` remains as a compatibility facade. It re-exports the request client and public types from feature modules so existing imports do not break.

### Frontend styles

The JavaScript-facing CSS module remains `app/journey/journey.module.scss` during the refactor. Feature-owned Sass partials are imported by that file in the exact current cascade order. Components continue using the same `styles.<className>` API.

This avoids changing class usage and minimizes visual risk while still giving each feature ownership of its styles. The final module contains only ordered imports and truly shared tokens or shell rules. Before and after screenshots at desktop and mobile widths verify visual equivalence.

### API

The current `journeyRoutes` export and every `/api/journey/...` path remain unchanged. `journey.routes.ts` becomes a route composer and overview endpoint rather than a domain monolith.

```text
services/api/src/features/journey/
  journey.routes.ts
  overview.service.ts
  journey.types.ts

services/api/src/features/relationships/
  relationship-access.service.ts

services/api/src/features/invitations/
  invitation.routes.ts
  invitation.schemas.ts
  invitation.service.ts

services/api/src/features/conversations/
  conversation.catalog.ts
  conversation.routes.ts
  conversation.schemas.ts
  conversation.service.ts
  alignment.ts

services/api/src/features/check-ins/
  check-in.routes.ts
  check-in.schemas.ts
  check-in.service.ts
  check-in.view.ts

services/api/src/features/atlas/
  atlas.catalog.ts
  atlas.routes.ts
  atlas.schemas.ts
  atlas.service.ts
  atlas.view.ts

services/api/src/features/roadmap/
  roadmap.routes.ts
  roadmap.schemas.ts
  roadmap.service.ts
  roadmap.view.ts

services/api/src/features/journey-notifications/
  journey-email.service.ts
```

Routes handle HTTP parsing, authentication gates, and response status codes. Services own transactions and domain transitions. View builders own API response serialization. Catalogs own static prompts and conversation definitions. Zod schemas stay beside the feature that consumes them.

Shared relationship membership checks live in the relationships slice because every journey feature uses them. Generic error helpers remain infrastructure rather than becoming a product feature.

`services/api/src/routes/journey.routes.ts` remains as a compatibility facade that exports the composed route plugin to `app.ts`.

## Data and Contract Preservation

- Prisma schema and migration history remain unchanged during the refactor.
- Existing response property names, nullability, status values, and ordering remain unchanged.
- Existing validation messages and HTTP status codes are captured before moving handlers.
- Existing transaction row locks and concurrency checks move intact with their owning service.
- Atlas proposal, selection, resolution, and versioned approval logic remain unchanged.
- The overview endpoint continues aggregating invitations, relationship state, conversations, check-ins, roadmap, and Atlas into one response.

## Characterization and Test Strategy

The project will add a lightweight test runner appropriate to the existing TypeScript stack. Tests are written before extraction and must fail if the captured behavior is intentionally perturbed.

### API characterization

- Alignment classification and trend calculation.
- Reflection availability date behavior.
- Atlas convergence outcomes: same proposal, crossed proposal, separate proposal, blend, keep-both, stale version, and dual approval.
- Response/view serialization for private and revealed states.
- Route registration and representative HTTP status/error behavior through Fastify injection with controlled authentication and Prisma boundaries.

### Frontend characterization

- Journey progress derivation.
- Atlas convergence state derivation and crossed-choice detection.
- Date formatting and reflection timing helpers.
- Component-level rendering for the major Atlas, conversation, and roadmap states where practical.
- Production build and TypeScript compilation remain required integration gates.

### Visual verification

- Capture the current Journey page at desktop and mobile widths for representative states available in the existing database.
- Repeat after style extraction and compare layout, typography, colors, spacing, responsive structure, and animation/reduced-motion rules.
- If automated browser capture is unavailable, keep styles in the single module and limit style work to mechanical partial extraction verified by build plus manual inspection.

## Extraction Order

1. Establish baseline checks and characterization tests.
2. Extract dependency-free shared utilities and compatibility facades.
3. Extract Atlas frontend and API slices first because its state transitions are the newest and most isolated.
4. Extract conversation catalog, selection, and check-in flow.
5. Extract roadmap proposals, accepted steps, and reflections.
6. Extract invitations and relationship access.
7. Reduce the journey shell and overview composer.
8. Split Sass into ordered feature-owned partials.
9. Run full verification and inspect the final dependency graph for cycles or duplicated logic.

Each step must leave the application buildable and runnable. No step combines behavior changes with file movement.

## Error Handling and Concurrency

- Existing `JourneyApiError` behavior remains the frontend error boundary for journey requests.
- Existing user-facing error strings remain unchanged.
- API services preserve row-level locks and optimistic `candidateVersion` checks.
- Feature services return typed outcomes; route handlers translate them into the same current HTTP statuses and payloads.
- No catch-all error abstraction will hide Prisma or Fastify behavior during this refactor.

## Completion Criteria

- No journey product file exceeds roughly 500 lines without a documented reason.
- `workspace.tsx` and `journey.routes.ts` are compatibility/composition files, not domain implementations.
- Atlas, conversations/check-ins, roadmap, and invitations can each be understood from one feature directory.
- Current UI, copy, animations, API responses, routes, database behavior, and authentication behavior are unchanged.
- Characterization tests, frontend production build, frontend lint, frontend type check, API type check, Prisma generation, migration status, and diff checks pass.
- The live local/ngrok workflow still serves the Journey page successfully.

## Builder Decisions Already Made

- Use feature slices rather than technical layers.
- Preserve behavior strictly.
- Keep callback/prop-based React orchestration; do not introduce global state.
- Keep compatibility facades at current import paths.
- Keep a single compiled CSS module while moving source rules into ordered feature partials.
- Add tests before moving behavior-bearing code.
- Refactor incrementally, beginning with Atlas.

## Remaining Builder Latitude

- Exact test runner selection, provided it works with the current TypeScript and Next/Fastify setup without runtime behavior changes.
- Exact internal service function names and file boundaries where the responsibilities above remain intact.
- Whether a very small, stable type belongs in the journey aggregate or its owning feature, as long as dependencies remain acyclic.
