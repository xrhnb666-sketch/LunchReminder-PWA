const crypto = require("crypto");
const webpush = require("web-push");
const { PushDeliveryError } = require("./errors");

const fingerprintValue = (value) =>
	crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

const getEndpointHost = (endpoint) => {
	try {
		return new URL(endpoint).host;
	} catch {
		return "invalid-endpoint";
	}
};

const getSubscriptionDiagnostics = (client) => ({
	exists: true,
	endpointHost: getEndpointHost(client.subscription.endpoint),
	endpointFingerprint: fingerprintValue(client.subscription.endpoint),
	p256dhFingerprint: fingerprintValue(client.subscription.keys.p256dh),
	authFingerprint: fingerprintValue(client.subscription.keys.auth),
	p256dhLength: client.subscription.keys.p256dh.length,
	authLength: client.subscription.keys.auth.length,
	contentEncodings: client.contentEncodings ?? [],
	updatedAt: client.updatedAt,
});

const pushErrorCodeForStatus = (statusCode) => {
	if (statusCode === 404 || statusCode === 410) return "push_subscription_expired";
	if (statusCode === 401 || statusCode === 403) return "push_authentication_failed";
	if (statusCode === 429) return "push_rate_limited";
	return "push_delivery_failed";
};

const pushErrorStatusCode = (error) =>
	typeof error === "object" && error !== null && "statusCode" in error
		? Number(error.statusCode)
		: undefined;

const assertSubscription = (client) => {
	if (!client?.subscription?.endpoint || !client.subscription.keys?.p256dh || !client.subscription.keys?.auth) {
		throw new PushDeliveryError("invalid_subscription", "Push subscription is missing required fields");
	}
};

const assertVapidConfig = () => {
	const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
	if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
		throw new PushDeliveryError("vapid_config_missing", "VAPID configuration is missing");
	}
	if (!VAPID_SUBJECT.startsWith("mailto:") && !VAPID_SUBJECT.startsWith("https://")) {
		throw new PushDeliveryError("vapid_config_missing", "VAPID subject must start with mailto: or https://");
	}
	try {
		webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
	} catch (error) {
		const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown VAPID configuration error";
		throw new PushDeliveryError("vapid_config_missing", `VAPID configuration is invalid: ${message}`);
	}
};

const sendPushPayload = async (client, payload) => {
	assertSubscription(client);
	assertVapidConfig();
	try {
		const response = await webpush.sendNotification(client.subscription, JSON.stringify(payload), { TTL: 300 });
		return { ok: true, statusCode: response.statusCode };
	} catch (error) {
		const statusCode = pushErrorStatusCode(error);
		throw new PushDeliveryError(pushErrorCodeForStatus(statusCode), "Push delivery failed", statusCode ?? null);
	}
};

const sendEmptyPush = async (client) => {
	assertSubscription(client);
	assertVapidConfig();
	try {
		const response = await webpush.sendNotification(client.subscription, null, {
			TTL: 60,
			urgency: "high",
			vapidDetails: {
				subject: process.env.VAPID_SUBJECT,
				publicKey: process.env.VAPID_PUBLIC_KEY,
				privateKey: process.env.VAPID_PRIVATE_KEY,
			},
		});
		return { ok: true, statusCode: response.statusCode };
	} catch (error) {
		const statusCode = pushErrorStatusCode(error);
		throw new PushDeliveryError(pushErrorCodeForStatus(statusCode), "Empty push delivery failed", statusCode ?? null);
	}
};

const testPayload = () => ({
	title: "三餐提醒测试",
	body: "通知已经可以正常送达啦～",
	icon: "/icons/icon-192.png",
	badge: "/icons/icon-192.png",
	tag: "lunch-reminder-test",
	data: { url: "/", test: true },
});

const reminderPayload = (mealType, title, body, localDate) => ({
	title,
	body,
	icon: "/icons/icon-192.png",
	badge: "/icons/icon-192.png",
	tag: `${mealType}-reminder`,
	data: {
		type: "meal-reminder",
		mealType,
		localDate,
		url: localDate ? `/?checkin=${mealType}&date=${localDate}` : "/",
	},
});

module.exports = {
	fingerprintValue,
	getEndpointHost,
	getSubscriptionDiagnostics,
	reminderPayload,
	sendEmptyPush,
	sendPushPayload,
	testPayload,
};
