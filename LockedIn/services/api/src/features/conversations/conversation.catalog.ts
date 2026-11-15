export const conversationPacks = [
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


export type ConversationPack = (typeof conversationPacks)[number];

export function getConversationPack(packKey?: string): ConversationPack {
  return conversationPacks.find((pack) => pack.key === packKey) ?? conversationPacks[0];
}
