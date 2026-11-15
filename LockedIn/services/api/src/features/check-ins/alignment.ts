import type { ConversationPack } from "../conversations/conversation.catalog.js";

function optionLabel(questions: ConversationPack["questions"], questionKey: string, value: string) {
  const question = questions.find((item) => item.key === questionKey);
  return question?.options.find((option) => option.value === value)?.label ?? value;
}

export type RevealResponse = {
  userId: string;
  answers: unknown;
  shareKeys: string[];
  contextNotes: unknown;
  contextShareKeys: string[];
  revealConsentedAt: Date | null;
};

export function buildAlignment(
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

export type AlignmentItem = ReturnType<typeof buildAlignment>[number];

export function addAlignmentTrends(current: AlignmentItem[], previous: AlignmentItem[]) {
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
