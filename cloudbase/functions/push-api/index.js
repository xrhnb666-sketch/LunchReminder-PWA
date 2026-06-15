const cloudbase = require("@cloudbase/node-sdk");
const cors = require("cors");
const express = require("express");
const {
	BadRequest,
	PushDeliveryError,
	getSafeErrorDetails,
	statusForPushError,
} = require("../shared/errors");
const {
	fingerprintValue,
	getEndpointHost,
	getSubscriptionDiagnostics,
	sendEmptyPush,
	sendPushPayload,
	testPayload,
} = require("../shared/push");
const {
	assertClientId,
	assertTimezone,
	validateContentEncodings,
	validateSettings,
	validateSubscription,
} = require("../shared/validation");

const cloudApp = cloudbase.init({
	env: cloudbase.SYMBOL_CURRENT_ENV,
});
const db = cloudApp.database();
const collection = db.collection("push_clients");

const allowedOrigins = new Set([
	"https://lunch-reminder-d0gm3tznc07536699-1443161613.tcloudbaseapp.com",
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]);

const app = express();

app.use(cors({
	origin(origin, callback) {
		if (!origin || origin === process.env.ALLOWED_ORIGIN || allowedOrigins.has(origin)) {
			callback(null, origin || false);
			return;
		}
		callback(new BadRequest("origin_not_allowed"));
	},
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type"],
	maxAge: 86400,
}));
app.use(express.json({ limit: "32kb" }));

const getStoredClient = async (clientId) => {
	try {
		const result = await collection.doc(clientId).get();
		if (Array.isArray(result.data)) return result.data[0] ?? null;
		return result.data ?? null;
	} catch {
		return null;
	}
};

const saveStoredClient = async (client) => {
	await collection.doc(client.clientId).set(client);
};

const updateStoredClient = async (clientId, patch) => {
	await collection.doc(clientId).update(patch);
};

const deleteStoredClient = async (clientId) => {
	await collection.doc(clientId).remove();
};

const handlePushError = async ({ res, error, clientId, label }) => {
	if (error instanceof BadRequest) {
		res.status(400).json({ error: error.message });
		return;
	}
	const details = getSafeErrorDetails(error);
	console.error(label, details);
	if (error instanceof PushDeliveryError) {
		if (error.code === "push_subscription_expired") {
			await deleteStoredClient(clientId);
		}
		res.status(statusForPushError(error)).json({ error: error.code });
		return;
	}
	res.status(502).json({ error: "push_delivery_failed" });
};

app.get("/api/health", (_req, res) => {
	res.json({ ok: true, service: "LunchReminder CloudBase Push API" });
});

app.get("/api/vapid-public-key", (_req, res) => {
	res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

app.post("/api/subscriptions", async (req, res, next) => {
	try {
		const clientId = assertClientId(String(req.body?.clientId ?? ""));
		const existing = await getStoredClient(clientId);
		const now = new Date().toISOString();
		const client = {
			version: 1,
			clientId,
			subscription: validateSubscription(req.body.subscription),
			contentEncodings: validateContentEncodings(req.body.contentEncodings),
			timezone: assertTimezone(req.body.timezone),
			settings: validateSettings(req.body.settings),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			lastSent: existing?.lastSent ?? {},
			lastTestSentAt: existing?.lastTestSentAt,
		};
		await saveStoredClient(client);
		res.json({ ok: true, clientId });
	} catch (error) {
		next(error);
	}
});

app.put("/api/subscriptions/:clientId/settings", async (req, res, next) => {
	try {
		const clientId = assertClientId(req.params.clientId);
		const existing = await getStoredClient(clientId);
		if (!existing) {
			res.status(404).json({ error: "not_found" });
			return;
		}
		await updateStoredClient(clientId, {
			timezone: assertTimezone(req.body.timezone),
			settings: validateSettings(req.body.settings),
			updatedAt: new Date().toISOString(),
		});
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

app.delete("/api/subscriptions/:clientId", async (req, res, next) => {
	try {
		const clientId = assertClientId(req.params.clientId);
		await deleteStoredClient(clientId);
		res.json({ ok: true });
	} catch (error) {
		next(error);
	}
});

app.get("/api/subscriptions/:clientId/diagnostics", async (req, res, next) => {
	try {
		const clientId = assertClientId(req.params.clientId);
		const client = await getStoredClient(clientId);
		if (!client) {
			res.json({ exists: false });
			return;
		}
		res.json(getSubscriptionDiagnostics(client));
	} catch (error) {
		next(error);
	}
});

app.post("/api/subscriptions/:clientId/test", async (req, res, next) => {
	try {
		const clientId = assertClientId(req.params.clientId);
		const client = await getStoredClient(clientId);
		if (!client) {
			res.status(404).json({ error: "not_found" });
			return;
		}
		const now = new Date();
		if (client.lastTestSentAt && now.getTime() - new Date(client.lastTestSentAt).getTime() < 30_000) {
			res.status(429).json({ error: "push_rate_limited" });
			return;
		}
		const result = await sendPushPayload(client, testPayload());
		console.log("test_push_sent", {
			pushServiceStatus: result.statusCode,
			endpointHost: getEndpointHost(client.subscription.endpoint),
			endpointFingerprint: fingerprintValue(client.subscription.endpoint),
			testType: "payload",
		});
		await updateStoredClient(clientId, {
			lastTestSentAt: now.toISOString(),
			updatedAt: now.toISOString(),
		});
		res.json({ ok: true, testType: "payload", pushServiceStatus: result.statusCode });
	} catch (error) {
		await handlePushError({ res, error, clientId: req.params.clientId, label: "test_push_failed" }).catch(next);
	}
});

app.post("/api/subscriptions/:clientId/test-empty", async (req, res, next) => {
	try {
		const clientId = assertClientId(req.params.clientId);
		const client = await getStoredClient(clientId);
		if (!client) {
			res.status(404).json({ error: "not_found" });
			return;
		}
		const result = await sendEmptyPush(client);
		console.log("test_push_sent", {
			pushServiceStatus: result.statusCode,
			endpointHost: getEndpointHost(client.subscription.endpoint),
			endpointFingerprint: fingerprintValue(client.subscription.endpoint),
			testType: "empty",
		});
		res.json({ ok: true, testType: "empty", pushServiceStatus: result.statusCode });
	} catch (error) {
		await handlePushError({ res, error, clientId: req.params.clientId, label: "test_push_failed" }).catch(next);
	}
});

app.use((error, _req, res, _next) => {
	if (error instanceof BadRequest) {
		res.status(error.message === "origin_not_allowed" ? 403 : 400).json({ error: error.message });
		return;
	}
	console.error("cloudbase_api_error", getSafeErrorDetails(error));
	res.status(500).json({ error: "internal_error" });
});

exports.main = app;
