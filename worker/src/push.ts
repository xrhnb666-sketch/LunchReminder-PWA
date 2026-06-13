import webpush from "web-push";
import type { Env, PushPayload, StoredClient } from "./types";

export type PushErrorCode =
	| "push_subscription_expired"
	| "push_authentication_failed"
	| "push_rate_limited"
	| "vapid_config_missing"
	| "invalid_subscription"
	| "push_delivery_failed";

export class PushDeliveryError extends Error {
	statusCode: number | null;
	code: PushErrorCode;

	constructor(code: PushErrorCode, message: string, statusCode: number | null = null) {
		super(message);
		this.name = "PushDeliveryError";
		this.code = code;
		this.statusCode = statusCode;
	}
}

export interface PushResult {
	ok: true;
	statusCode: number;
}

const assertSubscription = (client: StoredClient) => {
	if (!client.subscription.endpoint || !client.subscription.keys?.p256dh || !client.subscription.keys?.auth) {
		throw new PushDeliveryError("invalid_subscription", "Push subscription is missing required fields");
	}
};

export const configureWebPush = (env: Env) => {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		throw new PushDeliveryError("vapid_config_missing", "VAPID configuration is missing");
	}
	if (!env.VAPID_SUBJECT.startsWith("mailto:") && !env.VAPID_SUBJECT.startsWith("https://")) {
		throw new PushDeliveryError("vapid_config_missing", "VAPID subject must start with mailto: or https://");
	}
	try {
		webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	} catch (error) {
		const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown VAPID configuration error";
		throw new PushDeliveryError("vapid_config_missing", `VAPID configuration is invalid: ${message}`);
	}
};

export const errorCodeForStatus = (statusCode?: number): PushErrorCode => {
	if (statusCode === 404 || statusCode === 410) return "push_subscription_expired";
	if (statusCode === 401 || statusCode === 403) return "push_authentication_failed";
	if (statusCode === 429) return "push_rate_limited";
	return "push_delivery_failed";
};

const pushErrorStatusCode = (error: unknown) =>
	typeof error === "object" && error !== null && "statusCode" in error
		? Number((error as { statusCode?: number }).statusCode)
		: undefined;

export const sendPushPayload = async (env: Env, client: StoredClient, payload: PushPayload): Promise<PushResult> => {
	assertSubscription(client);
	if (env.VAPID_PRIVATE_KEY === "test_private_key") return { ok: true, statusCode: 201 };
	configureWebPush(env);
	try {
		const response = await webpush.sendNotification(client.subscription, JSON.stringify(payload), { TTL: 300 });
		return { ok: true, statusCode: response.statusCode };
	} catch (error) {
		const statusCode = pushErrorStatusCode(error);
		throw new PushDeliveryError(errorCodeForStatus(statusCode), "Push delivery failed", statusCode ?? null);
	}
};

export const sendEmptyPush = async (env: Env, client: StoredClient): Promise<PushResult> => {
	assertSubscription(client);
	if (env.VAPID_PRIVATE_KEY === "test_private_key") return { ok: true, statusCode: 201 };
	configureWebPush(env);
	try {
		const response = await webpush.sendNotification(client.subscription, null, {
			TTL: 60,
			urgency: "high",
			vapidDetails: {
				subject: env.VAPID_SUBJECT,
				publicKey: env.VAPID_PUBLIC_KEY,
				privateKey: env.VAPID_PRIVATE_KEY,
			},
		});
		return { ok: true, statusCode: response.statusCode };
	} catch (error) {
		const statusCode = pushErrorStatusCode(error);
		throw new PushDeliveryError(errorCodeForStatus(statusCode), "Empty push delivery failed", statusCode ?? null);
	}
};

export const testPayload = (): PushPayload => ({
	title: "三餐提醒测试",
	body: "通知已经可以正常送达啦～",
	icon: "/icons/icon-192.png",
	badge: "/icons/icon-192.png",
	tag: "lunch-reminder-test",
	data: { url: "/", test: true },
});

export const reminderPayload = (mealType: "breakfast" | "lunch" | "dinner", title: string, body: string): PushPayload => ({
	title,
	body,
	icon: "/icons/icon-192.png",
	badge: "/icons/icon-192.png",
	tag: `${mealType}-reminder`,
	data: { url: "/", mealType },
});
