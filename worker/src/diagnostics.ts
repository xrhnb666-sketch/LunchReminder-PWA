import type { StoredClient } from "./types";

const hexFromBuffer = (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

export const fingerprintValue = async (value: string) => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return hexFromBuffer(digest).slice(0, 12);
};

export const getEndpointHost = (endpoint: string) => {
	try {
		return new URL(endpoint).host;
	} catch {
		return "invalid-endpoint";
	}
};

export const getSubscriptionDiagnostics = async (client: StoredClient) => ({
	exists: true,
	endpointHost: getEndpointHost(client.subscription.endpoint),
	endpointFingerprint: await fingerprintValue(client.subscription.endpoint),
	p256dhFingerprint: await fingerprintValue(client.subscription.keys.p256dh),
	authFingerprint: await fingerprintValue(client.subscription.keys.auth),
	p256dhLength: client.subscription.keys.p256dh.length,
	authLength: client.subscription.keys.auth.length,
	contentEncodings: client.contentEncodings ?? [],
	updatedAt: client.updatedAt,
});
