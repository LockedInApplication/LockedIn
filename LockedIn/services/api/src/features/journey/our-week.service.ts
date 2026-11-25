import { withLockedTogether } from "../relationships/locked-together.service.js";

const dayMs = 86_400_000;
const highlightsPerSection = 4;
export class OurWeekUnavailable extends Error {}
export const unavailableRecap = () => new OurWeekUnavailable("This recap isn’t available in this space.");

// Both partners see the same last completed Monday–Sunday week, regardless
// of which time zone they open it in.
export function previousTogetherWeek(now: Date) {
  const end = new Date(now.getTime());
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
  return { start: new Date(end.getTime() - 7 * dayMs), end };
}

export async function readOurWeek(relationshipId: string, actorId: string, now = new Date()) {
  const { start, end } = previousTogetherWeek(now);
  const duringWeek = { gte: start, lt: end };
  const { value } = await withLockedTogether(relationshipId, actorId, unavailableRecap, async tx => {
    // Read titles and dates of shared items only. Media and details stay in their
    // original authorized views; no recap row, analytics event, or alert is made.
    const [plans, photos, topic] = await Promise.all([
      tx.roadmapPlan.findMany({
        where: { relationshipId, status: "DONE", completedAt: duringWeek },
        orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: highlightsPerSection,
        select: { id: true, title: true, completedAt: true },
      }),
      tx.togetherPhoto.findMany({
        where: { relationshipId, createdAt: duringWeek },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: highlightsPerSection,
        select: { id: true, title: true, createdAt: true, envelope: { select: { relationshipId: true, title: true } } },
      }),
      tx.roomTalkTopic.findFirst({
        where: { relationshipId, phase: "DISCUSSED", discussedAt: duringWeek },
        orderBy: [{ discussedAt: "desc" }, { id: "desc" }],
        select: { question: true, discussedAt: true },
      }),
    ]);
    return {
      startsOn: start.toISOString().slice(0, 10),
      endsOn: new Date(end.getTime() - dayMs).toISOString().slice(0, 10),
      plans: plans.flatMap(({ id, title, completedAt }) => completedAt ? [{ id, title, completedAt: completedAt.toISOString() }] : []),
      memories: photos.map(({ id, title, createdAt, envelope }) => ({
        id, title, sharedAt: createdAt.toISOString(), envelopeTitle: envelope?.relationshipId === relationshipId ? envelope.title : null,
      })),
      topic: topic?.discussedAt ? { title: topic.question, discussedAt: topic.discussedAt.toISOString() } : null,
    };
  });
  return value;
}
