import type { JourneyOverview } from "./journey.types";

export type NextAction = {
  title: string;
  description: string;
  buttonLabel: string;
  target: "current" | "conversations" | "atlas" | "roadmap";
  waiting: boolean;
};

export function getNextAction(overview: JourneyOverview): NextAction | null {
  if (!overview.relationship) return null;
  const partner = overview.relationship.partner.name;
  const session = overview.session;

  if (session && !session.bothRevealed) {
    if (!session.ownResponse) return {
      title: "Answer your questions", description: `Continue “${session.topic}” with your own private answers. Nothing opens until you both consent.`,
      buttonLabel: "Answer my questions", target: "current", waiting: false,
    };
    if (!session.partnerState.submitted) return {
      title: "Your part is done", description: `Your answers are still private. ${partner} needs to finish their questions before you can review sharing together.`,
      buttonLabel: "View my progress", target: "current", waiting: true,
    };
    if (!session.ownResponse.revealConsented) return {
      title: "Review what you’ll share", description: "Both reflections are ready. Review your selected answers before giving permission to reveal them.",
      buttonLabel: "Review sharing choices", target: "current", waiting: false,
    };
    return {
      title: "Your part is done", description: `Your answers are still private. The comparison opens only when ${partner} also consents, and only for answers you both selected.`,
      buttonLabel: "View my progress", target: "current", waiting: true,
    };
  }

  if (session?.proposals.some((proposal) => !proposal.proposedByCurrentUser)) return {
    title: "Review your partner’s suggestion", description: `${partner} suggested a next step. It becomes a shared plan only if you accept.`,
    buttonLabel: "Review their suggestion", target: "roadmap", waiting: false,
  };
  if (session?.nextSteps.some((step) => step.reflectionAvailable && !step.ownReflection)) return {
    title: "Reflect on your next step", description: "A shared step is ready to revisit. Share how it felt in your own private reflection.",
    buttonLabel: "Open my reflection", target: "roadmap", waiting: false,
  };

  const choice = overview.conversationSelection;
  if (choice?.partnerChoice.submitted && !choice.ownChoice.submitted) return {
    title: "Review your partner’s suggestion", description: `${partner} is ready to choose a conversation with you. Review their choice before you begin.`,
    buttonLabel: "Review their conversation", target: "conversations", waiting: false,
  };
  if (choice?.ownChoice.submitted) {
    if (choice.partnerChoice.submitted) return {
      title: "Choose a conversation together", description: "Your choices haven’t matched yet. Review both suggestions and choose what works for you both.",
      buttonLabel: "Review our choices", target: "conversations", waiting: false,
    };
    return {
      title: "Your suggestion is saved", description: `${partner} still needs to choose. A conversation begins only when your choices meet.`,
      buttonLabel: "View my suggestion", target: "conversations", waiting: true,
    };
  }

  const word = overview.atlas.words.find((item) => item.chapter && item.chapter.status !== "SHARED");
  if (word?.chapter) {
    const chapter = word.chapter;
    if (!chapter.ownResponse) return {
      title: `Answer your ${word.title} questions`, description: `Write what ${word.title.toLowerCase()} means to you. Your meanings open to each other once you both submit.`,
      buttonLabel: `Continue ${word.title}`, target: "atlas", waiting: false,
    };
    if (!chapter.partnerResponse.submitted) return {
      title: "Your part is done", description: `Your ${word.title.toLowerCase()} answers stay private until you both submit. ${partner} can add their meaning when they’re ready.`,
      buttonLabel: "View my progress", target: "atlas", waiting: true,
    };
    if (chapter.status === "PROPOSED") return chapter.ownFinalApproval ? {
      title: "Your approval is saved", description: `${partner} still needs to approve the shared ${word.title.toLowerCase()} wording. It is complete only with two approvals.`,
      buttonLabel: "View our wording", target: "atlas", waiting: true,
    } : {
      title: "Review your shared wording", description: `Read your proposed ${word.title.toLowerCase()} meaning and decide whether it accurately represents you.`,
      buttonLabel: "Review our wording", target: "atlas", waiting: false,
    };
    if (chapter.status === "PROPOSING" && chapter.proposals.some((proposal) => proposal.proposedByCurrentUser)
      && !chapter.proposals.some((proposal) => !proposal.proposedByCurrentUser)) return {
      title: "Your suggestion is saved", description: `${partner} still needs to propose their own ${word.title.toLowerCase()} wording before you compare both versions.`,
      buttonLabel: "View my progress", target: "atlas", waiting: true,
    };
    if (chapter.status === "CHOOSING" && chapter.ownSelection && !chapter.partnerSelection) return {
      title: "Your choice is saved", description: `${partner} still needs to choose how to bring your two meanings together.`,
      buttonLabel: "View my progress", target: "atlas", waiting: true,
    };
    if (chapter.status === "DISCOVERING" || chapter.status === "CHECKING") {
      if (chapter.partnerResponse.heardSummary && chapter.partnerResponse.heardStatus === "PENDING") return {
        title: "Check what your partner heard", description: `${partner} has reflected your meaning back to you. Let them know whether you feel understood.`,
        buttonLabel: "Review their understanding", target: "atlas", waiting: false,
      };
      const ownSummaryDone = chapter.ownResponse.heardSummary && !["ALMOST", "MISSING"].includes(chapter.ownResponse.heardStatus ?? "");
      const bothConfirmed = chapter.ownResponse.heardStatus === "CONFIRMED" && chapter.partnerResponse.heardStatus === "CONFIRMED";
      if (ownSummaryDone && !bothConfirmed) return {
        title: "Your part is done", description: `${partner} still has an understanding check to complete. Both meanings are already visible to each other.`,
        buttonLabel: "View my progress", target: "atlas", waiting: true,
      };
    }
    return {
      title: `Continue ${word.title} together`, description: "Both meanings are now visible to each other. Continue the understanding checks and work toward wording you both approve.",
      buttonLabel: `Continue ${word.title}`, target: "atlas", waiting: false,
    };
  }

  if (session?.proposals.length) return {
    title: "Your suggestion is saved", description: `${partner} can review your next-step proposal when they’re ready. It is not a shared agreement yet.`,
    buttonLabel: "View my suggestion", target: "roadmap", waiting: true,
  };
  if (session?.nextSteps.length) {
    if (session.nextSteps.every((step) => step.ownReflection && step.partnerReflection.submitted)) return {
      title: "Choose your next conversation", description: "You’ve both reflected on your next steps. Choose another topic when you’re ready.",
      buttonLabel: "Choose a conversation", target: "conversations", waiting: false,
    };
    if (session.nextSteps.every((step) => step.ownReflection)) return {
      title: "Your part is done", description: `Your reflection stays private until ${partner} adds theirs. You can return to your shared next steps at any time.`,
      buttonLabel: "View our next steps", target: "roadmap", waiting: true,
    };
    return {
      title: "Your next steps are planned", description: "Keep working on the plans you both accepted. Each reflection opens on its own revisit date.",
      buttonLabel: "View our next steps", target: "roadmap", waiting: false,
    };
  }
  if (session?.bothRevealed) return {
    title: "Choose your next step", description: "Your shared comparison is ready. Suggest one practical step for your partner to review.",
    buttonLabel: "Plan our next step", target: "roadmap", waiting: false,
  };
  return {
    title: "Choose a conversation", description: "Pick a topic you’d like to explore. Your partner gets their own choice before a conversation begins.",
    buttonLabel: "Choose a conversation", target: "conversations", waiting: false,
  };
}
