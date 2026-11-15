export const notificationCatalog: Record<string, {
    title: string;
    message: string;
    view: string;
}> = {
    INVITATION_ACCEPTED: { title: "Your shared space is ready", message: "Your invitation was accepted. Begin when you are ready.", view: "home" },
    CONVERSATION_CHOICE: { title: "A conversation suggestion is waiting", message: "Review your choices and decide together.", view: "conversations" },
    CONVERSATION_READY: { title: "Your conversation is ready", message: "Your private questions are ready to answer.", view: "home" },
    SHARING_READY: { title: "Review what you would like to share", message: "Both reflections are submitted. Your sharing choices remain yours.", view: "home" },
    GROUND_READY: { title: "Your shared ground is ready", message: "You both consented. Only mutually selected answers are included.", view: "home" },
    CHAPTER_STARTED: { title: "A meaning chapter is waiting", message: "Add your own meaning. It opens to each other when you both submit.", view: "atlas" },
    MEANING_SUBMITTED: { title: "Your partner added their meaning", message: "Add your own meaning when you are ready. Neither response opens until you both submit.", view: "atlas" },
    MEANING_LISTEN: { title: "Explore your partner’s meaning", message: "Both meanings are ready. Reflect back what you understood.", view: "atlas" },
    HEARD_CHECK: { title: "Check what your partner heard", message: "Let your partner know whether you feel accurately understood.", view: "atlas" },
    MEANING_PROPOSE: { title: "Propose your shared wording", message: "You both feel understood. Add your own wording for comparison.", view: "atlas" },
    MEANING_CHOICE: { title: "Compare your two proposals", message: "Choose a way forward. Neither version is ranked above the other.", view: "atlas" },
    MEANING_RESOLVE: { title: "Bring your meanings together", message: "Your choices differ. Work toward a version you both approve.", view: "atlas" },
    MEANING_APPROVE: { title: "Your shared wording is ready to review", message: "Read the current version. It needs both people’s approval.", view: "atlas" },
    CHAPTER_COMPLETE: { title: "A chapter you built together", message: "You both approved your shared meaning. It is saved in your history.", view: "atlas" },
    STEP_PROPOSED: { title: "A new next-step suggestion", message: "Review the suggestion. Nothing is agreed until you accept.", view: "roadmap" },
    STEP_ACCEPTED: { title: "Your next step was accepted", message: "A new agreement is on your shared roadmap.", view: "roadmap" },
    REFLECTIONS_READY: { title: "Your reflections are ready", message: "You have both reflected on this step. Revisit it together.", view: "roadmap" },
};
export function notificationCopy(kind: string) {
    return notificationCatalog[kind] ?? { title: "New activity in your shared space", message: "Open LockedIn to review the latest activity.", view: "home" };
}
