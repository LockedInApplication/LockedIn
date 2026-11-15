import { describe, expect, it } from "vitest";
import { NotificationBroker } from "./notification.broker.js";
describe("notification connection broker", () => {
    it("signals only the intended recipient and unsubscribes cleanly", () => {
        const broker = new NotificationBroker();
        let a = 0, b = 0;
        const off = broker.subscribe("a", () => a++);
        broker.subscribe("b", () => b++);
        broker.publish("a");
        expect([a, b]).toEqual([1, 0]);
        off?.();
        broker.publish("a");
        expect([a, b]).toEqual([1, 0]);
    });
    it("caps one user's connections without blocking another user", () => {
        const broker = new NotificationBroker();
        for (let i = 0; i < 4; i++)
            expect(broker.subscribe("a", () => { })).toBeTypeOf("function");
        expect(broker.subscribe("a", () => { })).toBeNull();
        expect(broker.subscribe("b", () => { })).toBeTypeOf("function");
    });
});
