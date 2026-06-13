import { getAllowedOrigin, handleOptions, json, withCors } from "./cors";
import { sendPushPayload, testPayload } from "./push";
import { runSchedule } from "./scheduler";
import type { Env, StoredClient } from "./types";
import { clientKey } from "./types";
import {
	BadRequest,
	assertClientId,
	assertTimezone,
	readJson,
	validateSettings,
	validateSubscription,
} from "./validation";

const notFound = () => json({ error: "not_found" }, 404);

const getStoredClient = (env: Env, clientId: string) =>
	env.REMINDERS.get<StoredClient>(clientKey(clientId), "json");

const saveStoredClient = (env: Env, client: StoredClient) =>
	env.REMINDERS.put(clientKey(client.clientId), JSON.stringify(client));

const handlePostSubscription = async (request: Request, env: Env) => {
	const body = await readJson(request);
	if (!body || typeof body !== "object") throw new BadRequest("invalid_body");
	const input = body as Record<string, unknown>;
	const clientId = String(input.clientId ?? "");
	assertClientId(clientId);
	const existing = await getStoredClient(env, clientId);
	const now = new Date().toISOString();
	const client: StoredClient = {
		version: 1,
		clientId,
		subscription: validateSubscription(input.subscription),
		timezone: assertTimezone(input.timezone),
		settings: validateSettings(input.settings),
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		lastSent: existing?.lastSent ?? {},
		lastTestSentAt: existing?.lastTestSentAt,
	};
	await saveStoredClient(env, client);
	return json({ ok: true, clientId });
};

const handlePutSettings = async (request: Request, env: Env, clientId: string) => {
	assertClientId(clientId);
	const existing = await getStoredClient(env, clientId);
	if (!existing) return notFound();
	const body = await readJson(request);
	if (!body || typeof body !== "object") throw new BadRequest("invalid_body");
	const input = body as Record<string, unknown>;
	const updated: StoredClient = {
		...existing,
		timezone: assertTimezone(input.timezone),
		settings: validateSettings(input.settings),
		updatedAt: new Date().toISOString(),
	};
	await saveStoredClient(env, updated);
	return json({ ok: true });
};

const handleDeleteSubscription = async (env: Env, clientId: string) => {
	assertClientId(clientId);
	await env.REMINDERS.delete(clientKey(clientId));
	return json({ ok: true });
};

const handleTestNotification = async (env: Env, clientId: string) => {
	assertClientId(clientId);
	const client = await getStoredClient(env, clientId);
	if (!client) return notFound();
	const now = new Date();
	if (client.lastTestSentAt && now.getTime() - new Date(client.lastTestSentAt).getTime() < 30_000) {
		return json({ error: "rate_limited" }, 429);
	}
	const result = await sendPushPayload(env, client, testPayload());
	if (result.invalidSubscription) {
		await env.REMINDERS.delete(clientKey(clientId));
		return json({ error: "subscription_invalid" }, 410);
	}
	if (!result.ok) return json({ error: "push_failed" }, 502);
	client.lastTestSentAt = now.toISOString();
	client.updatedAt = now.toISOString();
	await saveStoredClient(env, client);
	return json({ ok: true });
};

const route = async (request: Request, env: Env) => {
	const url = new URL(request.url);
	const method = request.method.toUpperCase();
	const segments = url.pathname.split("/").filter(Boolean);

	if (method === "OPTIONS") return handleOptions(request, env);
	if (request.headers.get("Origin") && !getAllowedOrigin(request, env)) {
		return json({ error: "origin_not_allowed" }, 403);
	}
	if (method === "GET" && url.pathname === "/api/health") {
		return json({ ok: true, service: "LunchReminder Push Worker" });
	}
	if (method === "GET" && url.pathname === "/api/vapid-public-key") {
		return json({ publicKey: env.VAPID_PUBLIC_KEY });
	}
	if (method === "POST" && url.pathname === "/api/subscriptions") {
		return handlePostSubscription(request, env);
	}
	if (segments[0] === "api" && segments[1] === "subscriptions" && segments[2]) {
		const clientId = segments[2];
		if (method === "PUT" && segments[3] === "settings") return handlePutSettings(request, env, clientId);
		if (method === "DELETE" && segments.length === 3) return handleDeleteSubscription(env, clientId);
		if (method === "POST" && segments[3] === "test") return handleTestNotification(env, clientId);
	}

	return notFound();
};

const safeRoute = async (request: Request, env: Env) => {
	try {
		return await route(request, env);
	} catch (error) {
		if (error instanceof BadRequest) return json({ error: error.message }, 400);
		console.error("worker_error");
		return json({ error: "internal_error" }, 500);
	}
};

export default {
	async fetch(request, env): Promise<Response> {
		return withCors(request, env, await safeRoute(request, env));
	},
	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(runSchedule(env));
	},
} satisfies ExportedHandler<Env>;
