import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index";
import { getLocalMinute, shouldSendMeal, processClient } from "../src/scheduler";
import type { Env, StoredClient } from "../src/types";
import { clientKey } from "../src/types";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const testEnv = () => ({
	...(env as unknown as Env),
	VAPID_PUBLIC_KEY: "BDkkptI1a-Dq_eXmgvisOatMO-Ss6z1I-BvRWqIiazFummGOJqtSNRkIl4C_5ZhbKfXkUNVf8ra13OH4QH3whJA",
	VAPID_PRIVATE_KEY: "test_private_key",
	VAPID_SUBJECT: "mailto:test@example.com",
	ALLOWED_ORIGIN: "https://lunch-reminder-pwa.vercel.app",
});

const sampleClientId = "11111111-1111-4111-8111-111111111111";

const sampleSettings = {
	breakfast: { time: "08:00", enabled: true, title: "早餐", subtitle: "清晨能量" },
	lunch: { time: "12:00", enabled: true, title: "午餐", subtitle: "先吃饭呀" },
	dinner: { time: "18:00", enabled: true, title: "晚餐", subtitle: "好好收尾" },
	weekdaysOnly: false,
	skippedDate: null,
	notificationMessages: {
		breakfast: ["早餐时间到了"],
		lunch: ["午饭时间到了"],
		dinner: ["晚饭时间到了"],
	},
};

const sampleSubscription = {
	endpoint: "https://push.example.test/send/abc",
	expirationTime: null,
	keys: {
		p256dh: "p256dh",
		auth: "auth",
	},
};

const request = (path: string, init?: RequestInit) =>
	new IncomingRequest(`https://worker.example${path}`, {
		...init,
		headers: {
			Origin: "https://lunch-reminder-pwa.vercel.app",
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});

const call = async (path: string, init?: RequestInit) => {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request(path, init), testEnv(), ctx);
	await waitOnExecutionContext(ctx);
	return response;
};

describe("LunchReminder Push Worker", () => {
	beforeEach(async () => {
		await testEnv().REMINDERS.delete(clientKey(sampleClientId));
	});

	it("responds to health", async () => {
		const response = await call("/api/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, service: "LunchReminder Push Worker" });
	});

	it("returns VAPID public key", async () => {
		const response = await call("/api/vapid-public-key");
		const body = await response.json() as { publicKey: string };
		expect(body.publicKey).toContain("BDkkptI1");
	});

	it("handles CORS preflight for allowed and rejected origins", async () => {
		const allowed = await call("/api/health", { method: "OPTIONS" });
		expect(allowed.status).toBe(204);
		expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://lunch-reminder-pwa.vercel.app");

		const rejected = await worker.fetch(new IncomingRequest("https://worker.example/api/health", {
			method: "OPTIONS",
			headers: { Origin: "https://evil.example" },
		}), testEnv(), createExecutionContext());
		expect(rejected.status).toBe(403);
	});

	it("validates subscription data", async () => {
		const response = await call("/api/subscriptions", {
			method: "POST",
			body: JSON.stringify({ clientId: "bad", subscription: sampleSubscription, timezone: "UTC", settings: sampleSettings }),
		});
		expect(response.status).toBe(400);
	});

	it("creates updates and deletes subscriptions", async () => {
		const created = await call("/api/subscriptions", {
			method: "POST",
			body: JSON.stringify({
				clientId: sampleClientId,
				subscription: sampleSubscription,
				timezone: "Asia/Taipei",
				settings: sampleSettings,
			}),
		});
		expect(created.status).toBe(200);
		expect(await testEnv().REMINDERS.get(clientKey(sampleClientId))).not.toBeNull();

		const updated = await call(`/api/subscriptions/${sampleClientId}/settings`, {
			method: "PUT",
			body: JSON.stringify({
				timezone: "Asia/Shanghai",
				settings: { ...sampleSettings, weekdaysOnly: true },
			}),
		});
		expect(updated.status).toBe(200);

		const deleted = await call(`/api/subscriptions/${sampleClientId}`, { method: "DELETE" });
		expect(deleted.status).toBe(200);
		expect(await testEnv().REMINDERS.get(clientKey(sampleClientId))).toBeNull();
	});

	it("rate limits test notifications", async () => {
		await call("/api/subscriptions", {
			method: "POST",
			body: JSON.stringify({
				clientId: sampleClientId,
				subscription: sampleSubscription,
				timezone: "Asia/Taipei",
				settings: sampleSettings,
			}),
		});
		expect((await call(`/api/subscriptions/${sampleClientId}/test`, { method: "POST", body: "{}" })).status).toBe(200);
		expect((await call(`/api/subscriptions/${sampleClientId}/test`, { method: "POST", body: "{}" })).status).toBe(429);
	});

	it("returns safe push errors for missing VAPID configuration", async () => {
		const envForTest = { ...testEnv(), VAPID_PRIVATE_KEY: "" };
		await envForTest.REMINDERS.put(clientKey(sampleClientId), JSON.stringify({
			version: 1,
			clientId: sampleClientId,
			subscription: sampleSubscription,
			timezone: "Asia/Taipei",
			settings: sampleSettings,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastSent: {},
		} satisfies StoredClient));

		const ctx = createExecutionContext();
		const response = await worker.fetch(request(`/api/subscriptions/${sampleClientId}/test`, {
			method: "POST",
			body: "{}",
		}), envForTest, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "vapid_config_missing" });
	});

	it("returns safe push errors for invalid subscriptions", async () => {
		const envForTest = testEnv();
		await envForTest.REMINDERS.put(clientKey(sampleClientId), JSON.stringify({
			version: 1,
			clientId: sampleClientId,
			subscription: {
				...sampleSubscription,
				keys: { p256dh: sampleSubscription.keys.p256dh, auth: "" },
			},
			timezone: "Asia/Taipei",
			settings: sampleSettings,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastSent: {},
		} satisfies StoredClient));

		const response = await call(`/api/subscriptions/${sampleClientId}/test`, {
			method: "POST",
			body: "{}",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_subscription" });
	});

	it("converts timezone minute and avoids duplicate lastSent", async () => {
		const local = getLocalMinute(new Date("2026-06-12T04:00:00.000Z"), "Asia/Taipei");
		expect(local).toEqual({ dateKey: "2026-06-12", time: "12:00", weekday: 5 });
		const client: StoredClient = {
			version: 1,
			clientId: sampleClientId,
			subscription: sampleSubscription,
			timezone: "Asia/Taipei",
			settings: sampleSettings,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastSent: {},
		};
		expect(shouldSendMeal(client, "lunch", local)).toBe(true);
		client.lastSent.lunch = "2026-06-12:12:00";
		expect(shouldSendMeal(client, "lunch", local)).toBe(false);
	});

	it("respects skipToday and weekdaysOnly", () => {
		const local = { dateKey: "2026-06-13", time: "12:00", weekday: 6 };
		const client: StoredClient = {
			version: 1,
			clientId: sampleClientId,
			subscription: sampleSubscription,
			timezone: "Asia/Taipei",
			settings: { ...sampleSettings, weekdaysOnly: true, skippedDate: "2026-06-13" },
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastSent: {},
		};
		expect(shouldSendMeal(client, "lunch", local)).toBe(false);
	});

	it("processClient updates lastSent after successful push", async () => {
		const envForTest = testEnv();
		const client: StoredClient = {
			version: 1,
			clientId: sampleClientId,
			subscription: sampleSubscription,
			timezone: "Asia/Taipei",
			settings: sampleSettings,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			lastSent: {},
		};
		await processClient(envForTest, client, new Date("2026-06-12T04:00:00.000Z"));
		const stored = await envForTest.REMINDERS.get<StoredClient>(clientKey(sampleClientId), "json");
		expect(stored?.lastSent.lunch).toBe("2026-06-12:12:00");
	});
});
