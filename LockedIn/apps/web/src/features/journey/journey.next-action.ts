import type { JourneyOverview } from "./journey.types";

export type NextAction = {
  title: string;
  description: string;
  buttonLabel: string;
  target: "current" | "conversations";
  waiting: boolean;
};

export function getNextAction(overview: JourneyOverview): NextAction | null {
  if (!overview.relationship) return null;
  const partner = overview.relationship.partner.name;
  const session = overview.session;

  if (session && !session.bothRevealed) {
    if (!session.ownResponse) return {
      title: "Continue your conversation", description: `Answer your questions for “${session.topic}” privately.`,
      buttonLabel: "Answer my questions", target: "current", waiting: false,
    };
    if (!session.partnerState.submitted) return {
      title: "Waiting for your partner", description: `Your answers are still private. ${partner} hasn’t finished answering yet.`,
      buttonLabel: "View my progress", target: "current", waiting: true,
    };
    if (!session.ownResponse.revealConsented) return {
      title: "Review what you’ll share", description: "You’ve both answered. Review your choices before deciding what to share.",
      buttonLabel: "Review sharing choices", target: "current", waiting: false,
    };
    return {
      title: "Waiting for your partner", description: `Your answers are still private until ${partner} also agrees to share.`,
      buttonLabel: "View my progress", target: "current", waiting: true,
    };
  }

  const choice = overview.conversationSelection;
  if (choice?.partnerChoice.submitted && !choice.ownChoice.submitted) return {
    title: "Your partner made a choice", description: `Review ${partner}’s choice, then make your own.`,
    buttonLabel: "Review their choice", target: "conversations", waiting: false,
  };
  if (choice?.ownChoice.submitted) {
    if (choice.partnerChoice.submitted) return {
      title: "Find a topic you both want", description: "Your choices haven’t matched yet. Review them together before you begin.",
      buttonLabel: "Review our choices", target: "conversations", waiting: false,
    };
    return {
      title: "Waiting for your partner", description: `Your choice is saved. ${partner} still needs to make a choice.`,
      buttonLabel: "View my choice", target: "conversations", waiting: true,
    };
  }

  if (session?.bothRevealed) return {
    title: "Ready for another conversation?", description: "Your shared answers are below. You can pick a new topic whenever you’re ready.",
    buttonLabel: "Pick another topic", target: "conversations", waiting: false,
  };

  return {
    title: "Start with a topic", description: "Pick something you’d like to talk about. You’ll each answer privately, then decide what to share.",
    buttonLabel: "Pick a conversation topic", target: "conversations", waiting: false,
  };
}
