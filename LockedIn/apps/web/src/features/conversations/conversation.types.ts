export type IntentionQuestion = {
  key: string;
  label: string;
  helper: string;
  options: Array<{ value: string; label: string }>;
};

export type AlignmentItem = {
  key: string;
  label: string;
  ownAnswer: string;
  partnerAnswer: string;
  aligned: boolean;
  ownContext?: string | null;
  partnerContext?: string | null;
  trend?:
    | "shared-this-time"
    | "still-shared"
    | "new-shared"
    | "changed"
    | "worth-discussing";
};

export type ConversationPack = {
  key: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  questionCount: number;
};
