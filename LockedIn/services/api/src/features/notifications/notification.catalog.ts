export const notificationCatalog: Record<string, {
    title: string;
    message: string;
    view: string;
}> = {
    DISCOVERY_INVITED: { title: "A starter invitation is waiting", message: "Review the question and choose whether to connect.", view: "discovery" },
    DISCOVERY_ACCEPTED: { title: "Your starter was accepted", message: "Your separate starter conversation is ready.", view: "discovery" },
    DISCOVERY_RESPONSE_SHARED: { title: "A starter response was shared", message: "Open this connection to read what was chosen to share.", view: "discovery" },
    DISCOVERY_BUILD_READY: { title: "A choice to build is waiting", message: "Review the deeper shared-space choice. It still needs your independent choice.", view: "discovery" },
    DISCOVERY_PROMOTED: { title: "Your shared space is ready", message: "You both chose to build. Your starter history stays separate.", view: "discovery" },
    INVITATION_RECEIVED: {title:"You’ve been invited to a shared space",message:"Review the invitation. Connecting does not reveal any answers.",view:"invitations"},
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
    ROADMAP_PLAN_REPLY: { title: "A plan needs your reply", message: "Open your roadmap to see the suggestion.", view: "roadmap" },
    STEP_ACCEPTED: { title: "Your next step was accepted", message: "A new agreement is on your shared roadmap.", view: "roadmap" },
    REFLECTIONS_READY: { title: "Your reflections are ready", message: "You have both reflected on this step. Revisit it together.", view: "roadmap" },
};
export function notificationCopy(kind: string) {
    return notificationCatalog[kind] ?? { title: "New activity in your shared space", message: "Open LockedIn to review the latest activity.", view: "home" };
}
