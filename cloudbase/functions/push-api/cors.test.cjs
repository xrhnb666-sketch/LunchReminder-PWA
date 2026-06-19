const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");

process.env.NODE_PATH = [
	path.resolve(__dirname, "../../deploy/push-api/node_modules"),
	process.env.NODE_PATH,
].filter(Boolean).join(path.delimiter);
Module._initPaths();

const records = [
	{
		_id: "16d6a9b2-fe90-445f-983b-f8b86bd3dc8c_2026-06-20_lunch",
		version: 1,
		clientId: "16d6a9b2-fe90-445f-983b-f8b86bd3dc8c",
		mealType: "lunch",
		localDate: "2026-06-20",
		timezone: "Asia/Shanghai",
		scheduledTime: "12:00",
		status: "completed",
		completedAt: "2026-06-20T04:00:00.000Z",
		snoozedUntil: null,
		snoozeMinutes: null,
		snoozeDeliveredAt: null,
		skipReason: null,
		note: null,
		firstReminderAt: null,
		lastReminderAt: null,
		reminderCount: 0,
		createdAt: "2026-06-20T04:00:00.000Z",
		updatedAt: "2026-06-20T04:00:00.000Z",
	},
];

const makeCollection = () => ({
	doc(id) {
		return {
			get: async () => ({ data: records.find((record) => record._id === id) ?? null }),
			set: async () => ({}),
			update: async () => ({ updated: 1 }),
			remove: async () => ({}),
		};
	},
	where(query) {
		return {
			get: async () => ({ data: records.filter((record) => record.clientId === query.clientId) }),
			update: async () => ({ updated: 1 }),
		};
	},
});

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
	if (request === "@cloudbase/node-sdk") {
		return {
			SYMBOL_CURRENT_ENV: Symbol.for("test-cloudbase-env"),
			init: () => ({
				database: () => ({
					collection: () => makeCollection(),
				}),
			}),
		};
	}
	return originalLoad.call(this, request, parent, isMain);
};

const { app } = require("./index.js");

const allowedOrigin = "https://lunch-reminder-pwa-lunch-reminder-d0gm3tznc07536699.webapps.tcloudbase.com";
const clientId = "16d6a9b2-fe90-445f-983b-f8b86bd3dc8c";

const withServer = async (callback) => {
	const server = http.createServer(app);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const { port } = server.address();
		return await callback(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
};

const getAcao = (response) => response.headers.get("access-control-allow-origin");

test("allowed origin is validated without function-level ACAO", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/health`, {
			headers: { Origin: allowedOrigin },
		});
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.deepEqual(body, { ok: true, service: "LunchReminder CloudBase Push API" });
		assert.equal(getAcao(response), null);
	});
});

test("function-level ACAO is absent and cannot be duplicated", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/vapid-public-key`, {
			headers: { Origin: allowedOrigin },
		});

		assert.equal(response.status, 200);
		assert.equal(getAcao(response), null);
		assert.equal(String(getAcao(response)).includes(","), false);
	});
});

test("allowed OPTIONS succeeds without function-level ACAO", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/health`, {
			method: "OPTIONS",
			headers: {
				Origin: allowedOrigin,
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "content-type",
			},
		});

		assert.equal(response.status, 204);
		assert.equal(getAcao(response), null);
		assert.equal(response.headers.get("access-control-allow-methods"), null);
		assert.equal(response.headers.get("access-control-allow-headers"), null);
	});
});

test("illegal origin is rejected", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/health`, {
			headers: { Origin: "https://evil.example" },
		});
		const body = await response.json();

		assert.equal(response.status, 403);
		assert.deepEqual(body, { error: "origin_not_allowed" });
		assert.equal(getAcao(response), null);
	});
});

test("health check without origin succeeds", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/health`);

		assert.equal(response.status, 200);
		assert.equal(getAcao(response), null);
	});
});

test("public key today and history routes smoke", async () => {
	await withServer(async (baseUrl) => {
		const publicKey = await fetch(`${baseUrl}/api/vapid-public-key`, {
			headers: { Origin: allowedOrigin },
		});
		const today = await fetch(`${baseUrl}/api/checkins/${clientId}/today?timezone=Asia%2FShanghai`, {
			headers: { Origin: allowedOrigin },
		});
		const history = await fetch(`${baseUrl}/api/checkins/${clientId}?from=2026-06-20&to=2026-06-20`, {
			headers: { Origin: allowedOrigin },
		});

		assert.equal(publicKey.status, 200);
		assert.equal(today.status, 200);
		assert.equal(history.status, 200);
		assert.equal(getAcao(publicKey), null);
		assert.equal(getAcao(today), null);
		assert.equal(getAcao(history), null);
		assert.equal((await today.json()).ok, true);
		assert.equal((await history.json()).ok, true);
	});
});

test("complete action route returns parseable JSON", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/checkins/${clientId}/2026-06-20/lunch/action`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: allowedOrigin,
			},
			body: JSON.stringify({
				action: "complete",
				timezone: "Asia/Shanghai",
				scheduledTime: "12:00",
			}),
		});
		const text = await response.text();
		const data = JSON.parse(text);

		assert.equal(response.status, 200);
		assert.equal(getAcao(response), null);
		assert.equal(data.ok, true);
		assert.equal(data.record.clientId, clientId);
		assert.equal(data.record.mealType, "lunch");
	});
});
