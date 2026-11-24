import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { lockDiscoveryUsers } from "../discovery/discovery-locks.js";
import { pairClosure } from "../messaging/messaging-conversation.service.js";
import { notificationBroker, persistTask } from "../notifications/index.js";
import { inAppActivityAllowed } from "../notifications/notification-preferences.js";
import { nextSimplePlanState, roadmapReplyKind, simplePlanCompletionOpensAt, simplePlanSchedule, type SimplePlanSchedule } from "./simple-plan-policy.js";
import type { SimplePlanAction, SimplePlanCreate } from "./simple-plan.schemas.js";

export class SimplePlanError extends Error {
  constructor(readonly status: 404 | 409, message: string) { super(message); }
}

const unavailable = () => new SimplePlanError(404, "This shared space is not available.");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const name = (user: { displayName: string | null; name: string | null }) => user.displayName || user.name || "Your partner";

async function activePair(tx: Prisma.TransactionClient, relationshipId: string, actorId: string) {
  const space = await tx.relationship.findFirst({
    where: { id: relationshipId, status: "ACTIVE", members: { some: { userId: actorId } } },
    select: { members: { select: { userId: true } } },
  });
  if (space?.members.length !== 2) throw unavailable();
  return space.members.map(member => member.userId);
}

export async function listSimplePlans(relationshipId: string, actorId: string) {
  try {
    const pair = await activePair(prisma, relationshipId, actorId);
    if (await pairClosure(prisma, pair[0]!, pair[1]!)) return null;
    const rows = await prisma.roadmapPlan.findMany({
      where: { relationshipId, relationship: { status: "ACTIVE", members: { some: { userId: actorId } } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { proposer: { select: { displayName: true, name: true } }, resolvedBy: { select: { displayName: true, name: true } } },
    });
    return rows.map(plan => ({
      id: plan.id, title: plan.title, note: plan.note, day: plan.day?.toISOString().slice(0, 10) ?? null,
      completionOpensAt: simplePlanCompletionOpensAt(plan)?.toISOString() ?? null,
      status: plan.status, version: plan.version, yours: plan.proposerId === actorId,
      proposerName: name(plan.proposer), resolvedBy: plan.resolvedById === actorId ? "You" : plan.resolvedBy ? name(plan.resolvedBy) : null,
    }));
  } catch (error) {
    if (error instanceof SimplePlanError && error.status === 404) return null;
    throw error;
  }
}

type PlanCommand = { id: null; input: SimplePlanCreate } | { id: string; input: SimplePlanAction };

function fields(plan: SimplePlanCreate["plan"], previous?: SimplePlanSchedule) {
  return { title: plan.title, note: plan.note || null, ...simplePlanSchedule(plan.day, plan.timeZone, previous) };
}

export async function changeSimplePlan(relationshipId: string, actorId: string, command: PlanCommand) {
  const key = digest([relationshipId, actorId, command.input.requestId]);
  const fingerprint = digest(command);
  const result = await prisma.$transaction(async tx => {
    const initial = await activePair(tx, relationshipId, actorId);
    await lockDiscoveryUsers(tx, initial);
    await tx.$queryRaw`SELECT id FROM "Relationship" WHERE id = ${relationshipId} FOR UPDATE`;
    const pair = await activePair(tx, relationshipId, actorId);
    if (!pair.every(id => initial.includes(id)) || await pairClosure(tx, pair[0]!, pair[1]!)) throw unavailable();
    const prior = await tx.roadmapPlanRequest.findUnique({ where: { key } });
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new SimplePlanError(409, "This request was already used for a different change.");
      return { id: prior.planId, changed: false, pair, notify: null };
    }
    const partner = pair.find(id => id !== actorId)!;
    let plan;
    if (command.id === null) {
      const pending = await tx.roadmapPlan.count({ where: { relationshipId, status: "PENDING" } });
      if (pending >= 20) throw new SimplePlanError(409, "Reply to or withdraw an open suggestion before adding another one.");
      plan = await tx.roadmapPlan.create({ data: { relationshipId, proposerId: actorId, ...fields(command.input.plan) } });
    } else {
      const existing = await tx.roadmapPlan.findFirst({ where: { id: command.id, relationshipId } });
      if (!existing) throw new SimplePlanError(404, "Plan not found.");
      if (existing.version !== command.input.version) throw new SimplePlanError(409, "This plan changed. Review the latest version before replying.");
      const state = nextSimplePlanState(existing.status, command.input.action, existing.proposerId === actorId);
      if (!state) throw new SimplePlanError(409, "That action isn’t available for this plan.");
      const opensAt = command.input.action === "done" ? simplePlanCompletionOpensAt(existing) : null;
      if (opensAt && opensAt.getTime() > Date.now()) throw new SimplePlanError(409, "You can mark this plan done once its scheduled day starts.");
      plan = await tx.roadmapPlan.update({ where: { id: existing.id }, data: {
        version: { increment: 1 }, status: state,
        ...(command.input.action === "counter" ? { ...fields(command.input.plan, existing), proposerId: actorId } : {}),
        resolvedById: state === "PENDING" || state === "ACCEPTED" ? null : actorId,
      } });
      await tx.notification.updateMany({ where: { relationshipId, entityId: plan.id, kind: roadmapReplyKind, resolvedAt: null }, data: { resolvedAt: new Date() } });
    }
    await tx.roadmapPlanRequest.create({ data: { key, fingerprint, planId: plan.id } });
    const notify = plan.status === "PENDING" ? partner : null;
    if (notify) await persistTask(tx, { kind: roadmapReplyKind, recipientId: notify, relationshipId, entityId: plan.id,
      wordKey: null, eventKey: JSON.stringify([notify, roadmapReplyKind, plan.id, plan.version]) });
    return { id: plan.id, changed: true, pair, notify };
  });
  if (result.changed) await Promise.allSettled(result.pair.map(async id => {
    notificationBroker.publish(id, id === result.notify && await inAppActivityAllowed(prisma, id));
  }));
  return { id: result.id };
}
