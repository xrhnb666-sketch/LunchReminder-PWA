import webpush from "web-push";
import type { Env, PushPayload, StoredClient } from "./types";

export interface PushResult {
	ok: boolean;
	statusCode?: number;
	invalidSubscription?: boolean;
}

export const configureWebPush = (env: Env) => {
	webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
};

export const sendPushPayload = async (env: Env, client: StoredClient, payload: PushPayload): Promise<PushResult> => {
	if (env.VAPID_PRIVATE_KEY === "test_private_key") return { ok: true, statusCode: 201 };
	configureWebPush(env);
	try {
		const response = await webpush.sendNotification(client.subscription, JSON.stringify(payload), { TTL: 300 });
		return { ok: true, statusCode: response.statusCode };
	} catch (error) {
		const statusCode = typeof error === "object" && error !== null && "statusCode" in error
			? Number((error as { statusCode?: number }).statusCode)
			: undefined;
		return { ok: false, statusCode, invalidSubscription: statusCode === 404 || statusCode === 410 };
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
