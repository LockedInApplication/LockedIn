export class NotificationBroker {
    private listeners = new Map<string, Set<(activity: boolean) => void>>();
    subscribe(userId: string, listener: (activity: boolean) => void): (() => void) | null {
        const group = this.listeners.get(userId) ?? new Set();
        if (group.size >= 4)
            return null;
        group.add(listener);
        this.listeners.set(userId, group);
        return () => { group.delete(listener); if (!group.size)
            this.listeners.delete(userId); };
    }
    publish(userId: string, activity = true) {
        for (const listener of this.listeners.get(userId) ?? []) {
            // A disconnected socket must never turn a committed save into a failed request.
            try {
                listener(activity);
            }
            catch { /* persistence remains the source of truth */ }
        }
    }
}
export const notificationBroker = new NotificationBroker();
