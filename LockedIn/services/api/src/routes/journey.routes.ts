import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getAuthenticatedUser } from "../lib/session.js";
import { sendJourneyNotificationEmail } from "../lib/email.js";
import { env } from "../config/env.js";
import { atlasWords } from "../features/atlas/atlas.catalog.js";
import { registerAtlasRoutes } from "../features/atlas/atlas.routes.js";
import { buildAtlasView } from "../features/atlas/atlas.view.js";
import { isRelationshipMember } from "../features/relationships/relationship-access.service.js";

const conversationPacks = [
  {
    key: "direction",
    title: "Where are we going?",
    description: "Talk about direction, timing, and what would make the next chapter feel possible.",
    icon: "↗",
    accent: "teal",
    questions: [
      {
        key: "future",
        label: "How do you currently see this relationship?",
        helper: "Choose what feels honest today, not what you think should be true.",
        options: [
          { value: "exploring", label: "Still exploring" },
          { value: "long-term", label: "Building toward something long-term" },
          { value: "unsure", label: "I am not sure yet" },
        ],
      },
      {
        key: "nextChapter",
        label: "Which next chapter feels most relevant?",
        helper: "This is a conversation starter, not a promise or deadline.",
        options: [
          { value: "quality-time", label: "More intentional quality time" },
          { value: "shared-home", label: "Exploring living together" },
          { value: "families", label: "Meeting or involving our families" },
          { value: "future-plans", label: "Discussing our longer-term future" },
        ],
      },
      {
        key: "timing",
        label: "When would you feel comfortable revisiting this?",
        helper: "Different timing is useful information, not a compatibility score.",
        options: [
          { value: "soon", label: "Within the next three months" },
          { value: "six-months", label: "Within three to six months" },
          { value: "year", label: "Within six to twelve months" },
          { value: "open", label: "I do not want a timeline yet" },
        ],
      },
      {
        key: "support",
        label: "What would help you feel ready for the next conversation?",
        helper: "Choose the practical concern you most want to understand together.",
        options: [
          { value: "finances", label: "More clarity about finances" },
          { value: "career", label: "More clarity about work or location" },
          { value: "family", label: "More clarity about family expectations" },
          { value: "space", label: "More clarity about independence and personal space" },
          { value: "time", label: "More time before deciding" },
        ],
      },
    ],
  },
  {
    key: "connection",
    title: "Quality time & connection",
    description: "Understand what helps each of you feel close, present, and cared for.",
    icon: "✦",
    accent: "blue",
    questions: [
      { key: "connection_frequency", label: "How connected have you felt lately?", helper: "Answer from your recent experience.", options: [{ value: "very", label: "Very connected" }, { value: "mostly", label: "Mostly connected" }, { value: "mixed", label: "It has been mixed" }, { value: "distant", label: "More distant than I want" }] },
      { key: "connection_time", label: "What kind of time together would help most?", helper: "Choose what feels most restorative now.", options: [{ value: "quiet", label: "Unstructured quiet time" }, { value: "date", label: "A planned date or activity" }, { value: "talk", label: "A deeper conversation" }, { value: "space", label: "A little space first" }] },
      { key: "connection_care", label: "How do you most want care to be shown?", helper: "This can change with circumstances.", options: [{ value: "words", label: "Words and reassurance" }, { value: "time", label: "Focused time" }, { value: "help", label: "Practical help" }, { value: "affection", label: "Affection and closeness" }] },
      { key: "connection_next", label: "What feels like a realistic next step?", helper: "Small and mutual is better than impressive.", options: [{ value: "weekly", label: "Protect regular time together" }, { value: "date", label: "Plan one meaningful date" }, { value: "ritual", label: "Create a small daily ritual" }, { value: "talk", label: "Talk about what has felt missing" }] },
    ],
  },
  {
    key: "communication",
    title: "Communication & repair",
    description: "Explore what makes difficult conversations safer and more productive.",
    icon: "◎",
    accent: "coral",
    questions: [
      { key: "communication_state", label: "How do difficult conversations feel right now?", helper: "Describe the pattern, not the person.", options: [{ value: "safe", label: "Mostly safe and productive" }, { value: "uneven", label: "Sometimes productive" }, { value: "avoid", label: "We tend to avoid them" }, { value: "escalate", label: "They escalate too quickly" }] },
      { key: "communication_need", label: "What helps you stay present?", helper: "Choose the condition that matters most.", options: [{ value: "time", label: "Time to think first" }, { value: "tone", label: "A calmer tone" }, { value: "specific", label: "One specific issue at a time" }, { value: "reassurance", label: "Reassurance that we are a team" }] },
      { key: "communication_repair", label: "What kind of repair feels meaningful?", helper: "Repair can look different to each person.", options: [{ value: "apology", label: "A direct apology" }, { value: "change", label: "A visible change in behavior" }, { value: "understanding", label: "Feeling fully understood" }, { value: "reconnect", label: "Intentional reconnection" }] },
      { key: "communication_next", label: "What should you practice together?", helper: "Pick one shared skill to build.", options: [{ value: "pause", label: "Taking a pause without withdrawing" }, { value: "listen", label: "Reflective listening" }, { value: "checkin", label: "A regular check-in" }, { value: "support", label: "Getting outside support" }] },
    ],
  },
  {
    key: "money",
    title: "Money & priorities",
    description: "Compare comfort, transparency, and the financial conversations you need next.",
    icon: "◇",
    accent: "gold",
    questions: [
      { key: "money_openness", label: "How comfortable are you discussing money?", helper: "There is no ideal answer.", options: [{ value: "open", label: "Comfortable and open" }, { value: "some", label: "Comfortable with some topics" }, { value: "nervous", label: "Nervous but willing" }, { value: "private", label: "I need more privacy for now" }] },
      { key: "money_priority", label: "Which priority feels most important now?", helper: "Choose the one creating the most pressure or possibility.", options: [{ value: "stability", label: "Building stability" }, { value: "debt", label: "Reducing debt" }, { value: "experience", label: "Enjoying life together" }, { value: "future", label: "Saving for a shared future" }] },
      { key: "money_shared", label: "What level of financial coordination feels right?", helper: "This is not a commitment.", options: [{ value: "separate", label: "Mostly separate" }, { value: "shared-costs", label: "Coordinate shared costs" }, { value: "planning", label: "Plan major goals together" }, { value: "unsure", label: "I am not sure yet" }] },
      { key: "money_next", label: "What conversation would help next?", helper: "Start with clarity, not a full financial plan.", options: [{ value: "habits", label: "Spending and saving habits" }, { value: "obligations", label: "Debt and obligations" }, { value: "goals", label: "Long-term goals" }, { value: "boundaries", label: "Financial boundaries" }] },
    ],
  },
  {
    key: "family",
    title: "Family expectations",
    description: "Talk about involvement, boundaries, traditions, and what family means to each of you.",
    icon: "⌂",
    accent: "plum",
    questions: [
      { key: "family_involvement", label: "How involved should family be in your relationship?", helper: "Think about everyday influence and major decisions.", options: [{ value: "close", label: "Closely involved" }, { value: "balanced", label: "Involved with clear boundaries" }, { value: "limited", label: "Limited involvement" }, { value: "depends", label: "It depends on the situation" }] },
      { key: "family_meeting", label: "How do you feel about involving families more?", helper: "Readiness may differ without either person being wrong.", options: [{ value: "ready", label: "Ready now" }, { value: "soon", label: "Open to it soon" }, { value: "slow", label: "I want to move slowly" }, { value: "not-ready", label: "I am not ready" }] },
      { key: "family_tradition", label: "How important are family traditions?", helper: "Consider holidays, culture, and expectations.", options: [{ value: "central", label: "Central to my life" }, { value: "important", label: "Important but flexible" }, { value: "some", label: "A few matter to me" }, { value: "new", label: "I want us to create our own" }] },
      { key: "family_next", label: "What would create more clarity?", helper: "Choose the conversation that feels most useful.", options: [{ value: "boundaries", label: "Boundaries with relatives" }, { value: "introductions", label: "Introductions and timing" }, { value: "culture", label: "Culture and traditions" }, { value: "future", label: "Expectations for the future" }] },
    ],
  },
  {
    key: "space",
    title: "Independence & space",
    description: "Make room for closeness and individuality without treating them as opposites.",
    icon: "◌",
    accent: "slate",
    questions: [
      { key: "space_balance", label: "How does the closeness–independence balance feel?", helper: "Answer for the relationship as it is now.", options: [{ value: "good", label: "It feels balanced" }, { value: "closer", label: "I want more closeness" }, { value: "space", label: "I want more personal space" }, { value: "changing", label: "My needs are changing" }] },
      { key: "space_personal", label: "What kind of independence matters most?", helper: "Choose the area you most want respected.", options: [{ value: "time", label: "Time alone" }, { value: "friends", label: "Independent friendships" }, { value: "interests", label: "Personal interests" }, { value: "decisions", label: "Autonomy in decisions" }] },
      { key: "space_reassurance", label: "What makes space feel safe rather than distant?", helper: "Name the reassurance that helps most.", options: [{ value: "plans", label: "Clear plans to reconnect" }, { value: "communication", label: "A little communication" }, { value: "trust", label: "Trust without checking in" }, { value: "consistency", label: "Consistent affection" }] },
      { key: "space_next", label: "What boundary would help now?", helper: "Boundaries should protect connection as well as individuality.", options: [{ value: "schedule", label: "Protected personal time" }, { value: "privacy", label: "Clearer privacy expectations" }, { value: "social", label: "Social-time expectations" }, { value: "talk", label: "A conversation before deciding" }] },
    ],
  },
] as const;


type ConversationPack = (typeof conversationPacks)[number];

function getConversationPack(packKey?: string): ConversationPack {
  return conversationPacks.find((pack) => pack.key === packKey) ?? conversationPacks[0];
}

const inviteSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

const responseSchema = z.object({
  answers: z.record(z.string(), z.string()),
  shareKeys: z.array(z.string()),
  contextNotes: z.record(z.string(), z.string().trim().max(600)).default({}),
  contextShareKeys: z.array(z.string()).default([]),
});

const conversationChoiceSchema = z.object({
  packKey: z.string().nullable(),
});

const nextStepSchema = z.object({
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().max(600).optional(),
  targetDate: z.string().date().optional(),
});

const reflectionSchema = z.object({
  outcome: z.enum(["COMPLETED", "CHANGED", "PAUSED", "NOT_RELEVANT"]),
  note: z.string().trim().max(600).optional(),
});

function sendError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

async function sendJourneyEmailSafely(
  request: FastifyRequest,
  params: Parameters<typeof sendJourneyNotificationEmail>[0],
) {
  try {
    await sendJourneyNotificationEmail(params);
  } catch (error) {
    request.log.warn({ error }, "Journey notification email could not be sent");
  }
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    sendError(reply, 401, "Please sign in to continue.");
    return null;
  }

  return user;
}

async function getActiveRelationship(userId: string) {
  return prisma.relationship.findFirst({
    where: {
      status: "ACTIVE",
      members: { some: { userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, displayName: true, email: true },
          },
        },
      },
    },
  });
}

function optionLabel(questions: ConversationPack["questions"], questionKey: string, value: string) {
  const question = questions.find((item) => item.key === questionKey);
  return question?.options.find((option) => option.value === value)?.label ?? value;
}

type RevealResponse = {
  userId: string;
  answers: unknown;
  shareKeys: string[];
  contextNotes: unknown;
  contextShareKeys: string[];
  revealConsentedAt: Date | null;
};

function buildAlignment(
  responses: RevealResponse[],
  userId: string,
  questions: ConversationPack["questions"],
) {
  if (
    responses.length !== 2 ||
    responses.some((response) => !response.revealConsentedAt)
  ) {
    return [];
  }

  const ownResponse = responses.find((response) => response.userId === userId);
  const partnerResponse = responses.find((response) => response.userId !== userId);
  if (!ownResponse || !partnerResponse) return [];

  const ownAnswers = ownResponse.answers as Record<string, string>;
  const partnerAnswers = partnerResponse.answers as Record<string, string>;
  const ownContext = ownResponse.contextNotes as Record<string, string>;
  const partnerContext = partnerResponse.contextNotes as Record<string, string>;

  return questions
    .filter(
      (question) =>
        ownResponse.shareKeys.includes(question.key) &&
        partnerResponse.shareKeys.includes(question.key),
    )
    .map((question) => ({
      key: question.key,
      label: question.label,
      ownAnswer: optionLabel(questions, question.key, ownAnswers[question.key] ?? ""),
      partnerAnswer: optionLabel(questions, question.key, partnerAnswers[question.key] ?? ""),
      aligned: ownAnswers[question.key] === partnerAnswers[question.key],
      ownContext: ownResponse.contextShareKeys.includes(question.key)
        ? ownContext[question.key] || null
        : null,
      partnerContext: partnerResponse.contextShareKeys.includes(question.key)
        ? partnerContext[question.key] || null
        : null,
    }));
}

type AlignmentItem = ReturnType<typeof buildAlignment>[number];

function addAlignmentTrends(current: AlignmentItem[], previous: AlignmentItem[]) {
  const previousByKey = new Map(previous.map((item) => [item.key, item]));

  return current.map((item) => {
    const earlier = previousByKey.get(item.key);
    let trend: "shared-this-time" | "still-shared" | "new-shared" | "changed" | "worth-discussing";

    if (!earlier) {
      trend = item.aligned ? "shared-this-time" : "worth-discussing";
    } else if (
      item.aligned &&
      earlier.aligned &&
      item.ownAnswer === earlier.ownAnswer &&
      item.partnerAnswer === earlier.partnerAnswer
    ) {
      trend = "still-shared";
    } else if (item.aligned) {
      trend = "new-shared";
    } else if (
      item.ownAnswer !== earlier.ownAnswer ||
      item.partnerAnswer !== earlier.partnerAnswer
    ) {
      trend = "changed";
    } else {
      trend = "worth-discussing";
    }

    return { ...item, trend };
  });
}

async function buildCheckInSnapshot(sessionId: string, userId: string) {
  const session = await prisma.intentionSession.findUnique({
    where: { id: sessionId },
    include: { responses: true },
  });
  if (!session) return null;

  const alignment = buildAlignment(
    session.responses,
    userId,
    getConversationPack(session.packKey).questions,
  );
  const revealedDates = session.responses
    .map((response) => response.revealConsentedAt)
    .filter((value): value is Date => Boolean(value));

  if (revealedDates.length !== 2) return null;

  return {
    id: session.id,
    topic: session.topic,
    createdAt: session.createdAt,
    revealedAt: new Date(Math.max(...revealedDates.map((value) => value.getTime()))),
    alignment,
  };
}

function reflectionOpensAt(targetDate: Date | null) {
  if (!targetDate) return null;

  const opening = new Date(targetDate);
  opening.setHours(0, 0, 0, 0);
  return opening;
}

async function buildSessionView(sessionId: string, userId: string) {
  const session = await prisma.intentionSession.findUnique({
    where: { id: sessionId },
    include: {
      relationship: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, displayName: true, email: true },
              },
            },
          },
        },
      },
      responses: true,
    },
  });

  if (!session || !session.relationship.members.some((member) => member.userId === userId)) {
    return null;
  }

  const ownResponse = session.responses.find((response) => response.userId === userId);
  const partnerMember = session.relationship.members.find((member) => member.userId !== userId);
  const partnerResponse = session.responses.find(
    (response) => response.userId === partnerMember?.userId,
  );
  const bothRevealed =
    session.responses.length === 2 &&
    session.responses.every((response) => Boolean(response.revealConsentedAt));

  const ownAnswers = (ownResponse?.answers ?? {}) as Record<string, string>;
  const pack = getConversationPack(session.packKey);
  const questions = pack.questions;
  const alignment = buildAlignment(session.responses, userId, questions);
  const relationshipNextSteps = await prisma.sharedNextStep.findMany({
    where: { session: { relationshipId: session.relationshipId } },
    orderBy: { createdAt: "desc" },
    include: {
      proposedBy: {
        select: { id: true, name: true, displayName: true, email: true },
      },
      reflections: true,
    },
  });

  const activeNextSteps = relationshipNextSteps
    .filter(
      (step) =>
        ["ACCEPTED", "COMPLETED", "PAUSED"].includes(step.status) ||
        (step.status === "REVISED" && step.reflections.length > 0),
    )
    .sort((left, right) => {
      const leftDate = left.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDate = right.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    });
  const pendingProposals = relationshipNextSteps.filter((step) => step.status === "PROPOSED");
  const proposalHistory = relationshipNextSteps.filter((step) => step.status === "DECLINED");

  function nextStepView(step: (typeof activeNextSteps)[number]) {
    const ownReflection = step.reflections.find((reflection) => reflection.userId === userId);
    const partnerReflection = step.reflections.find((reflection) => reflection.userId !== userId);
    const bothReflected = step.reflections.length === 2;
    const reflectionOpening = reflectionOpensAt(step.targetDate);

    return {
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      reflectionAvailable:
        reflectionOpening === null || reflectionOpening.getTime() <= Date.now(),
      reflectionOpensAt: reflectionOpening,
      status: step.status,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
      ownReflection: ownReflection
        ? { outcome: ownReflection.outcome, note: ownReflection.note }
        : null,
      partnerReflection: {
        submitted: Boolean(partnerReflection),
        outcome: bothReflected ? partnerReflection?.outcome : null,
      },
    };
  }

  return {
    id: session.id,
    topic: session.topic,
    packKey: session.packKey,
    createdAt: session.createdAt,
    status: session.status,
    questions,
    ownResponse: ownResponse
      ? {
          answers: ownAnswers,
          shareKeys: ownResponse.shareKeys,
          contextNotes: ownResponse.contextNotes as Record<string, string>,
          contextShareKeys: ownResponse.contextShareKeys,
          revealConsented: Boolean(ownResponse.revealConsentedAt),
        }
      : null,
    partnerState: {
      name:
        partnerMember?.user.displayName ??
        partnerMember?.user.name ??
        partnerMember?.user.email ??
        "Your partner",
      submitted: Boolean(partnerResponse),
      revealConsented: Boolean(partnerResponse?.revealConsentedAt),
    },
    bothRevealed,
    alignment,
    proposals: pendingProposals.map((step) => ({
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
    })),
    proposalHistory: proposalHistory.map((step) => ({
      id: step.id,
      title: step.title,
      details: step.details,
      targetDate: step.targetDate,
      status: step.status,
      proposedByCurrentUser: step.proposedById === userId,
      proposedByName:
        step.proposedBy.displayName ?? step.proposedBy.name ?? step.proposedBy.email,
    })),
    nextSteps: activeNextSteps.map(nextStepView),
    nextStep: activeNextSteps[0] ? nextStepView(activeNextSteps[0]) : null,
  };
}

export async function journeyRoutes(server: FastifyInstance) {
  await registerAtlasRoutes(server);

  server.get("/api/journey/overview", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const [pendingInvites, relationship] = await Promise.all([
      prisma.relationshipInvite.findMany({
        where: {
          status: "PENDING",
          expiresAt: { gt: new Date() },
          OR: [
            { inviteeId: user.id },
            { inviteeEmail: user.email.toLowerCase() },
          ],
        },
        include: {
          inviter: {
            select: { id: true, name: true, displayName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      getActiveRelationship(user.id),
    ]);

    const partner = relationship?.members.find((member) => member.userId !== user.id)?.user;
    let session = null;
    let conversationSelection = null;
    let atlas: Awaited<ReturnType<typeof buildAtlasView>> = {
      words: atlasWords.map((word) => ({ ...word, versionCount: 0, chapter: null })),
    };
    let checkInHistory: Array<NonNullable<Awaited<ReturnType<typeof buildCheckInSnapshot>>>> = [];
    if (relationship) {
      const sessions = await prisma.intentionSession.findMany({
        where: { relationshipId: relationship.id },
        orderBy: { createdAt: "desc" },
      });
      const activeSession = sessions.find((item) => item.status !== "ARCHIVED");
      const archivedSessions = sessions.filter((item) => item.status === "ARCHIVED");

      checkInHistory = (
        await Promise.all(
          archivedSessions.map((item) => buildCheckInSnapshot(item.id, user.id)),
        )
      ).filter(
        (item): item is NonNullable<typeof item> => item !== null,
      );

      if (activeSession) {
        session = await buildSessionView(activeSession.id, user.id);
        if (session) {
          session = {
            ...session,
            alignment: addAlignmentTrends(
              session.alignment,
              checkInHistory[0]?.alignment ?? [],
            ),
          };
        }
      }

      const choices = await prisma.conversationChoice.findMany({
        where: { relationshipId: relationship.id },
        include: {
          user: { select: { id: true, name: true, displayName: true, email: true } },
        },
        orderBy: { updatedAt: "asc" },
      });
      const ownChoice = choices.find((choice) => choice.userId === user.id);
      const partnerChoice = choices.find((choice) => choice.userId !== user.id);
      conversationSelection = {
        ownChoice: ownChoice
          ? { submitted: true, packKey: ownChoice.packKey }
          : { submitted: false, packKey: null },
        partnerChoice: partnerChoice
          ? {
              submitted: true,
              packKey: partnerChoice.packKey,
              name:
                partnerChoice.user.displayName ??
                partnerChoice.user.name ??
                partnerChoice.user.email,
            }
          : {
              submitted: false,
              packKey: null,
              name: partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
            },
      };

      atlas = await buildAtlasView(
        relationship.id,
        user.id,
        partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
      );
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        expiresAt: invite.expiresAt,
        inviter: {
          name:
            invite.inviter.displayName ??
            invite.inviter.name ??
            invite.inviter.email,
          email: invite.inviter.email,
        },
      })),
      relationship: relationship
        ? {
            id: relationship.id,
            partner: {
              name: partner?.displayName ?? partner?.name ?? partner?.email ?? "Your partner",
              email: partner?.email ?? "",
            },
          }
        : null,
      session,
      checkInHistory,
      conversationSelection,
      conversationPacks: conversationPacks.map(({ questions, ...pack }) => ({
        ...pack,
        questionCount: questions.length,
      })),
      atlas,
    };
  });

  server.post<{ Params: { relationshipId: string }; Body: { packKey: string | null } }>(
    "/api/journey/relationships/:relationshipId/conversation-choice",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { relationshipId } = request.params;
      if (!(await isRelationshipMember(relationshipId, user.id))) {
        return sendError(reply, 403, "You do not have access to this relationship space.");
      }

      const parsed = conversationChoiceSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a valid conversation.");
      if (
        parsed.data.packKey !== null &&
        !conversationPacks.some((pack) => pack.key === parsed.data.packKey)
      ) {
        return sendError(reply, 400, "Choose a valid conversation.");
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Relationship" WHERE "id" = ${relationshipId} FOR UPDATE`;

        const activeSession = await tx.intentionSession.findFirst({
          where: { relationshipId, status: { not: "ARCHIVED" } },
          include: { responses: true },
          orderBy: { createdAt: "desc" },
        });
        const currentComplete =
          !activeSession ||
          (activeSession.responses.length === 2 &&
            activeSession.responses.every((response) => Boolean(response.revealConsentedAt)));
        if (!currentComplete) {
          return { error: "Finish the current check-in together before choosing another conversation." };
        }

        await tx.conversationChoice.upsert({
          where: { relationshipId_userId: { relationshipId, userId: user.id } },
          update: { packKey: parsed.data.packKey },
          create: { relationshipId, userId: user.id, packKey: parsed.data.packKey },
        });

        const choices = await tx.conversationChoice.findMany({
          where: { relationshipId },
          orderBy: { updatedAt: "asc" },
        });
        if (choices.length < 2) return { started: false };

        const first = choices[0]!;
        const second = choices[1]!;
        const selectedPackKey =
          first.packKey === null && second.packKey === null
            ? null
            : first.packKey === null
              ? second.packKey
              : second.packKey === null
                ? first.packKey
                : first.packKey === second.packKey
                  ? first.packKey
                  : null;

        if (!selectedPackKey) return { started: false };

        const selectedPack = getConversationPack(selectedPackKey);
        if (activeSession) {
          await tx.intentionSession.updateMany({
            where: { relationshipId, status: { not: "ARCHIVED" } },
            data: { status: "ARCHIVED" },
          });
        }

        const session = await tx.intentionSession.create({
          data: {
            relationshipId,
            createdById: user.id,
            packKey: selectedPack.key,
            topic: selectedPack.title,
          },
        });
        await tx.conversationChoice.deleteMany({ where: { relationshipId } });

        return { started: true, sessionId: session.id };
      });

      if ("error" in result && result.error) {
        return sendError(reply, 409, result.error);
      }

      const partner = await prisma.relationshipMember.findFirst({
        where: { relationshipId, userId: { not: user.id } },
        include: { user: true },
      });
      if (partner?.user.email) {
        const chosenTitle =
          parsed.data.packKey === null
            ? "either conversation"
            : getConversationPack(parsed.data.packKey).title;
        await sendJourneyEmailSafely(request, {
          to: partner.user.email,
          name: partner.user.name,
          subject: result.started
            ? "Your next LockedIn conversation is ready"
            : "Your partner made a conversation choice",
          heading: result.started
            ? "You both chose the same conversation."
            : "A conversation choice is waiting for you.",
          message: result.started
            ? "Your private prompts are ready. Each person still controls what is eventually revealed."
            : `${user.name ?? "Your partner"} selected ${chosenTitle}. You can accept it, suggest another topic, or choose “Either works for me.”`,
          actionLabel: result.started ? "Begin privately" : "Review the choices",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(result.started ? 201 : 200).send(result);
    },
  );

  server.delete<{ Params: { relationshipId: string } }>(
    "/api/journey/relationships/:relationshipId/conversation-choice",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!(await isRelationshipMember(request.params.relationshipId, user.id))) {
        return sendError(reply, 403, "You do not have access to this relationship space.");
      }

      await prisma.conversationChoice.deleteMany({
        where: { relationshipId: request.params.relationshipId, userId: user.id },
      });
      return { withdrawn: true };
    },
  );

  server.post("/api/journey/invites", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, 400, "Enter a valid partner email.");

    if (parsed.data.email === user.email.toLowerCase()) {
      return sendError(reply, 400, "Invite a partner using a different email address.");
    }

    if (await getActiveRelationship(user.id)) {
      return sendError(reply, 409, "You already have an active relationship space.");
    }

    const invitee = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    const existingInvite = await prisma.relationshipInvite.findFirst({
      where: {
        inviterId: user.id,
        inviteeEmail: parsed.data.email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      await sendJourneyEmailSafely(request, {
        to: parsed.data.email,
        subject: `${user.name ?? "Someone"} invited you to LockedIn`,
        heading: "A private relationship space is waiting for you.",
        message: `${user.name ?? "Your partner"} invited you to reflect privately and build a shared roadmap together.`,
        actionLabel: "Open private invitation",
        url: `${env.APP_URL}/journey?invite=${existingInvite.token}`,
      });
      return { token: existingInvite.token, expiresAt: existingInvite.expiresAt };
    }

    const invite = await prisma.relationshipInvite.create({
      data: {
        inviterId: user.id,
        inviteeId: invitee?.id ?? null,
        inviteeEmail: parsed.data.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await sendJourneyEmailSafely(request, {
      to: parsed.data.email,
      subject: `${user.name ?? "Someone"} invited you to LockedIn`,
      heading: "A private relationship space is waiting for you.",
      message: `${user.name ?? "Your partner"} invited you to reflect privately and build a shared roadmap together.`,
      actionLabel: "Open private invitation",
      url: `${env.APP_URL}/journey?invite=${invite.token}`,
    });

    return reply.code(201).send({ token: invite.token, expiresAt: invite.expiresAt });
  });

  server.post<{ Params: { token: string } }>(
    "/api/journey/invites/:token/accept",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const invite = await prisma.relationshipInvite.findUnique({
        where: { token: request.params.token },
      });

      if (!invite || invite.status !== "PENDING" || !invite.expiresAt || invite.expiresAt <= new Date()) {
        return sendError(reply, 404, "This invitation is no longer available.");
      }

      if (
        invite.inviteeEmail?.toLowerCase() !== user.email.toLowerCase() &&
        invite.inviteeId !== user.id
      ) {
        return sendError(reply, 403, "Sign in with the email address that received this invitation.");
      }

      const [inviterRelationship, inviteeRelationship] = await Promise.all([
        getActiveRelationship(invite.inviterId),
        getActiveRelationship(user.id),
      ]);

      if (inviterRelationship || inviteeRelationship) {
        return sendError(reply, 409, "One of you already has an active relationship space.");
      }

      const relationship = await prisma.$transaction(async (tx) => {
        const created = await tx.relationship.create({
          data: {
            members: {
              create: [{ userId: invite.inviterId }, { userId: user.id }],
            },
          },
        });

        await tx.relationshipInvite.update({
          where: { id: invite.id },
          data: {
            status: "ACCEPTED",
            inviteeId: user.id,
            acceptedAt: new Date(),
          },
        });

        return created;
      });

      const inviter = await prisma.user.findUnique({ where: { id: invite.inviterId } });
      if (inviter?.email) {
        await sendJourneyEmailSafely(request, {
          to: inviter.email,
          name: inviter.name,
          subject: `${user.name ?? "Your partner"} accepted your LockedIn invitation`,
          heading: "Your shared space is ready.",
          message: `${user.name ?? "Your partner"} accepted your invitation. You can now choose a conversation and answer independently.`,
          actionLabel: "Open your shared space",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(201).send({ relationshipId: relationship.id });
    },
  );

  server.put<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/responses",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const session = await prisma.intentionSession.findUnique({
        where: { id: request.params.sessionId },
      });
      if (!session || !(await isRelationshipMember(session.relationshipId, user.id))) {
        return sendError(reply, 404, "Intention session not found.");
      }
      if (session.status === "ARCHIVED") {
        return sendError(reply, 409, "Earlier check-in chapters cannot be changed.");
      }

      const parsed = responseSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Complete each intention question.");

      const questions = getConversationPack(session.packKey).questions;
      const validKeys = new Set<string>(questions.map((question) => question.key));
      const complete = questions.every((question) => {
        const answer = parsed.data.answers[question.key];
        return question.options.some((option) => option.value === answer);
      });
      const shareKeysAreValid = parsed.data.shareKeys.every((key) => validKeys.has(key));
      const contextShareKeysAreValid = parsed.data.contextShareKeys.every((key) =>
        validKeys.has(key),
      );

      if (!complete || !shareKeysAreValid || !contextShareKeysAreValid) {
        return sendError(reply, 400, "Choose one valid answer for every question.");
      }

      const existing = await prisma.intentionResponse.findUnique({
        where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
      });
      if (existing?.revealConsentedAt) {
        return sendError(reply, 409, "Answers cannot be changed after you consent to reveal them.");
      }

      await prisma.intentionResponse.upsert({
        where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
        update: {
          answers: parsed.data.answers,
          shareKeys: parsed.data.shareKeys,
          contextNotes: parsed.data.contextNotes,
          contextShareKeys: parsed.data.contextShareKeys,
          submittedAt: new Date(),
        },
        create: {
          sessionId: session.id,
          userId: user.id,
          answers: parsed.data.answers,
          shareKeys: parsed.data.shareKeys,
          contextNotes: parsed.data.contextNotes,
          contextShareKeys: parsed.data.contextShareKeys,
        },
      });

      const responseCount = await prisma.intentionResponse.count({
        where: { sessionId: session.id },
      });
      await prisma.intentionSession.update({
        where: { id: session.id },
        data: { status: responseCount === 2 ? "READY_TO_REVEAL" : "COLLECTING" },
      });

      return buildSessionView(session.id, user.id);
    },
  );

  server.post<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/reveal",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const response = await prisma.intentionResponse.findUnique({
        where: {
          sessionId_userId: { sessionId: request.params.sessionId, userId: user.id },
        },
        include: { session: true },
      });
      if (!response || !(await isRelationshipMember(response.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Submit your intentions before revealing them.");
      }
      if (response.session.status === "ARCHIVED") {
        return sendError(reply, 409, "Earlier check-in chapters cannot be changed.");
      }

      await prisma.intentionResponse.update({
        where: { id: response.id },
        data: { revealConsentedAt: new Date() },
      });

      const revealCount = await prisma.intentionResponse.count({
        where: {
          sessionId: request.params.sessionId,
          revealConsentedAt: { not: null },
        },
      });
      await prisma.intentionSession.update({
        where: { id: request.params.sessionId },
        data: { status: revealCount === 2 ? "REVEALED" : "READY_TO_REVEAL" },
      });

      if (revealCount === 2) {
        const partner = await prisma.relationshipMember.findFirst({
          where: {
            relationshipId: response.session.relationshipId,
            userId: { not: user.id },
          },
          include: { user: true },
        });
        if (partner?.user.email) {
          await sendJourneyEmailSafely(request, {
            to: partner.user.email,
            name: partner.user.name,
            subject: "Your LockedIn shared ground is ready",
            heading: "You both chose what to reveal.",
            message: "Your new shared-ground snapshot is ready. Private answers remain private.",
            actionLabel: "View shared ground",
            url: `${env.APP_URL}/journey`,
          });
        }
      }

      return buildSessionView(request.params.sessionId, user.id);
    },
  );

  server.post<{ Params: { sessionId: string } }>(
    "/api/journey/sessions/:sessionId/next-steps",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const session = await prisma.intentionSession.findUnique({
        where: { id: request.params.sessionId },
      });
      if (!session || !(await isRelationshipMember(session.relationshipId, user.id))) {
        return sendError(reply, 404, "Intention session not found.");
      }
      if (session.status === "ARCHIVED") {
        return sendError(reply, 409, "Add new roadmap ideas from the current check-in.");
      }

      const revealCount = await prisma.intentionResponse.count({
        where: { sessionId: session.id, revealConsentedAt: { not: null } },
      });
      if (revealCount !== 2) {
        return sendError(reply, 409, "Both people must consent before choosing a shared next step.");
      }

      const parsed = nextStepSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Add a clear, specific next step.");

      const step = await prisma.sharedNextStep.create({
        data: {
          sessionId: session.id,
          proposedById: user.id,
          title: parsed.data.title,
          details: parsed.data.details || null,
          targetDate: parsed.data.targetDate
            ? new Date(`${parsed.data.targetDate}T12:00:00.000Z`)
            : null,
        },
      });

      const partner = await prisma.relationshipMember.findFirst({
        where: { relationshipId: session.relationshipId, userId: { not: user.id } },
        include: { user: true },
      });
      if (partner?.user.email) {
        await sendJourneyEmailSafely(request, {
          to: partner.user.email,
          name: partner.user.name,
          subject: "A new LockedIn roadmap idea is waiting",
          heading: "Your partner suggested a next step.",
          message: "Review it privately. It becomes shared only if you choose to accept it.",
          actionLabel: "Review the suggestion",
          url: `${env.APP_URL}/journey`,
        });
      }

      return reply.code(201).send({ id: step.id });
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/accept",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (step.proposedById === user.id) {
        return sendError(reply, 400, "Your partner needs to accept this proposal.");
      }
      if (step.status !== "PROPOSED") {
        return sendError(reply, 409, "This proposal is no longer waiting for acceptance.");
      }

      await prisma.$transaction([
        prisma.sharedNextStep.update({
          where: { id: step.id },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        }),
        prisma.intentionSession.update({
          where: { id: step.sessionId },
          data: { status: "ACTION_CHOSEN" },
        }),
      ]);

      const proposer = await prisma.user.findUnique({ where: { id: step.proposedById } });
      if (proposer?.email) {
        await sendJourneyEmailSafely(request, {
          to: proposer.email,
          name: proposer.name,
          subject: "Your LockedIn next step was accepted",
          heading: "A new step was added to your shared roadmap.",
          message: `Your partner accepted “${step.title}”. Its revisit date and reflections remain private until the right time.`,
          actionLabel: "View your roadmap",
          url: `${env.APP_URL}/journey`,
        });
      }

      return { accepted: true };
    },
  );

  server.post<{ Params: { stepId: string } }>(
    "/api/journey/next-steps/:stepId/reflections",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const step = await prisma.sharedNextStep.findUnique({
        where: { id: request.params.stepId },
        include: { session: true },
      });
      if (!step || !(await isRelationshipMember(step.session.relationshipId, user.id))) {
        return sendError(reply, 404, "Next step not found.");
      }
      if (!["ACCEPTED", "COMPLETED", "PAUSED"].includes(step.status)) {
        return sendError(reply, 409, "Accept the shared next step before reflecting on it.");
      }

      const reflectionOpening = reflectionOpensAt(step.targetDate);
      if (reflectionOpening && reflectionOpening.getTime() > Date.now()) {
        return sendError(
          reply,
          409,
          `Reflection opens on ${reflectionOpening.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}.`,
        );
      }

      const parsed = reflectionSchema.safeParse(request.body);
      if (!parsed.success) return sendError(reply, 400, "Choose a reflection outcome.");

      await prisma.reflection.upsert({
        where: { nextStepId_userId: { nextStepId: step.id, userId: user.id } },
        update: { outcome: parsed.data.outcome, note: parsed.data.note || null },
        create: {
          nextStepId: step.id,
          userId: user.id,
          outcome: parsed.data.outcome,
          note: parsed.data.note || null,
        },
      });

      const reflections = await prisma.reflection.findMany({ where: { nextStepId: step.id } });
      if (reflections.length === 2) {
        const finalStatus = reflections.every((item) => item.outcome === "COMPLETED")
          ? "COMPLETED"
          : reflections.some((item) => item.outcome === "CHANGED")
            ? "REVISED"
            : "PAUSED";

        const otherActiveSteps = await prisma.sharedNextStep.count({
          where: {
            sessionId: step.sessionId,
            id: { not: step.id },
            status: "ACCEPTED",
          },
        });

        await prisma.$transaction([
          prisma.sharedNextStep.update({
            where: { id: step.id },
            data: { status: finalStatus },
          }),
          prisma.intentionSession.update({
            where: { id: step.sessionId },
            data: { status: otherActiveSteps > 0 ? "ACTION_CHOSEN" : "REFLECTED" },
          }),
        ]);
      }

      return { saved: true };
    },
  );

  server.post<{ Params: { relationshipId: string } }>(
    "/api/journey/relationships/:relationshipId/leave",
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      if (!(await isRelationshipMember(request.params.relationshipId, user.id))) {
        return sendError(reply, 404, "Relationship space not found.");
      }

      await prisma.relationship.update({
        where: { id: request.params.relationshipId },
        data: { status: "ENDED" },
      });

      return { left: true };
    },
  );
}
