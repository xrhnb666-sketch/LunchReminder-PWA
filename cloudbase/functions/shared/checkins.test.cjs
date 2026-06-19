const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const Module = require("node:module");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

class MemoryCollection {
	constructor(seed = {}, options = {}) {
		this.store = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
		this.options = options;
		this.whereUpdateCalls = 0;
		this.updateCalls = [];
		this.setCalls = [];
	}

	doc(id) {
		return {
			get: async () => {
				if (this.options.failGet) throw new Error("mock_get_failed");
				return { data: this.store.has(id) ? structuredClone(this.store.get(id)) : [] };
			},
			set: async (value) => {
				const data = validateMockWriteData(value);
				this.setCalls.push({ id, data: structuredClone(data) });
				if (this.options.failSet) throw new Error("mock_set_failed");
				this.store.set(id, { _id: id, ...structuredClone(data) });
			},
			update: async (patch) => {
				const data = validateMockWriteData(patch);
				this.updateCalls.push({ type: "doc", id, data: structuredClone(data) });
				if (this.options.failDocUpdate) throw new Error("mock_update_failed");
				this.store.set(id, { ...(this.store.get(id) || {}), ...structuredClone(data) });
				return { updated: 1 };
			},
			remove: async () => {
				this.store.delete(id);
			},
		};
	}

	where(query) {
		return {
			get: async () => ({
				data: Array.from(this.store.values())
					.filter((record) => matchesQuery(record, query))
					.map((record) => structuredClone(record)),
			}),
			update: async (patch) => {
				if (this.options.beforeWhereUpdate) await this.options.beforeWhereUpdate({ query, patch, collection: this });
				const data = validateMockWriteData(patch);
				this.updateCalls.push({ type: "where", query: { ...query }, data: structuredClone(data) });
				this.whereUpdateCalls += 1;
				if (this.options.failWhereUpdate) throw new Error("mock_where_update_failed");
				if (this.options.failWhereUpdateAfter && this.whereUpdateCalls > this.options.failWhereUpdateAfter) {
					throw new Error("mock_where_update_failed");
				}
				if (this.options.whereUpdateCount === 0) return { updated: 0 };
				let updated = 0;
				for (const [id, record] of this.store.entries()) {
					if (!matchesQuery(record, query)) continue;
					this.store.set(id, { ...record, ...structuredClone(data) });
					updated += 1;
				}
				return { updated };
			},
		};
	}

	skip(count) {
		return {
			limit: (size) => ({
				get: async () => ({
					data: Array.from(this.store.values())
						.slice(count, count + size)
						.map((record) => structuredClone(record)),
				}),
			}),
		};
	}
}

const immutableMockUpdateFields = new Set(["_id", "_openid"]);

const validateMockWriteData = (patch) => {
	if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
		const error = new Error("参数必须是非空对象");
		error.code = "INVALID_PARAM";
		throw error;
	}
	for (const field of immutableMockUpdateFields) {
		if (Object.hasOwn(patch, field)) {
			const error = new Error(`不能更新${field}的值`);
			error.code = "INVALID_PARAM";
			throw error;
		}
	}
	return structuredClone(patch);
};

const assertNoImmutableUpdateFields = (collection) => {
	assert.notEqual(collection.updateCalls.length, 0);
	for (const call of collection.updateCalls) {
		assert.equal(Object.hasOwn(call.data, "_id"), false, `${call.type} update included _id`);
		assert.equal(Object.hasOwn(call.data, "_openid"), false, `${call.type} update included _openid`);
	}
};

const assertNoImmutableSetFields = (collection) => {
	assert.notEqual(collection.setCalls.length, 0);
	for (const call of collection.setCalls) {
		assert.equal(Object.hasOwn(call.data, "_id"), false, "set data included _id");
		assert.equal(Object.hasOwn(call.data, "_openid"), false, "set data included _openid");
	}
};

const mutableMockCheckinFields = new Set([
	"status",
	"completedAt",
	"snoozedUntil",
	"snoozeMinutes",
	"snoozeDeliveredAt",
	"snoozeDispatchState",
	"snoozeDispatchToken",
	"snoozeDispatchClaimedAt",
	"skipReason",
	"note",
	"firstReminderAt",
	"lastReminderAt",
	"reminderCount",
	"updatedAt",
]);

const assertOnlyMutableCheckinFields = (collection) => {
	for (const call of collection.updateCalls) {
		for (const field of Object.keys(call.data)) {
			assert.equal(mutableMockCheckinFields.has(field), true, `${call.type} update included ${field}`);
		}
	}
};

const matchesQuery = (record, query) =>
	Object.entries(query).every(([key, value]) => {
		if (typeof value === "function") return value(record[key]);
		return record[key] === value;
	});

const command = {
	eq: (expected) => Object.assign((value) => value === expected, {
		and(other) {
			return (value) => value === expected && other(value);
		},
	}),
	neq: (expected) => Object.assign((value) => value !== expected, {
		and(other) {
			return (value) => value !== expected && other(value);
		},
	}),
	gte: (expected) => Object.assign((value) => value >= expected, {
		and(other) {
			return (value) => value >= expected && other(value);
		},
	}),
	lte: (expected) => Object.assign((value) => value <= expected, {
		and(other) {
			return (value) => value <= expected && other(value);
		},
	}),
};

const mockDb = { command };
const currentProductionOrigin = "https://lunch-reminder-pwa-lunch-reminder-d0gm3tznc07536699.webapps.tcloudbase.com";
const legacyProductionOrigin = "https://lunch-reminder-d0gm3tznc07536699-1443161613.tcloudbaseapp.com";
const localhostOrigin = "http://localhost:5173";

const onceBeforeUpdate = (fn) => {
	let called = false;
	return async (context) => {
		if (called) return;
		called = true;
		await fn(context);
	};
};

const clientId = "123e4567-e89b-12d3-a456-426614174000";
const baseInput = {
	clientId,
	localDate: "2026-06-15",
	mealType: "lunch",
	timezone: "Asia/Shanghai",
	scheduledTime: "12:00",
};

const makeClient = (time = "12:00", overrides = {}) => ({
	clientId,
	timezone: "Asia/Shanghai",
	subscription: { endpoint: "https://example.test/push", keys: { p256dh: "key", auth: "auth" } },
	lastSent: {},
	settings: {
		breakfast: { time: "08:00", enabled: true, title: "鏃╅", subtitle: "鏃╅姝ｆ枃" },
		lunch: { time, enabled: true, title: "鍗堥", subtitle: "鍗堥姝ｆ枃" },
		dinner: { time: "18:00", enabled: true, title: "鏅氶", subtitle: "鏅氶姝ｆ枃" },
		weekdaysOnly: false,
		skippedDate: null,
		notificationMessages: {
			breakfast: ["鏃╅鎻愰啋"],
			lunch: ["鍗堥鎻愰啋"],
			dinner: ["鏅氶鎻愰啋"],
		},
		...overrides,
	},
});

test("snooze dispatch must be claimed before push and claim failure does not send", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const pushClients = new MemoryCollection({ [clientId]: makeClient("12:30") });
	const checkins = new MemoryCollection({}, { whereUpdateCount: 0 });
	const { snoozeCheckin } = require("./checkins");
	await snoozeCheckin(checkins, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"));
	const result = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:50:00.000Z"),
		db: mockDb,
	});
	assert.equal(result.sent, 0);
	assert.equal(sentPayloads.length, 0);
});

test("successful push with failed snooze finalize does not send again next minute", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const pushClients = new MemoryCollection({ [clientId]: makeClient("12:30") });
	const checkins = new MemoryCollection({
		[`${clientId}_2026-06-15_lunch`]: makeRecord("lunch", {
			status: "snoozed",
			snoozedUntil: "2026-06-15T03:50:00.000Z",
			snoozeMinutes: 20,
		}),
	}, { failWhereUpdateAfter: 1 });
	const due = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:50:00.000Z"),
		db: mockDb,
	});
	const repeated = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:51:00.000Z"),
		db: mockDb,
	});
	assert.equal(due.sent, 1);
	assert.equal(repeated.sent, 0);
	assert.equal(sentPayloads.length, 1);
	assert.equal(checkins.store.get(`${clientId}_2026-06-15_lunch`).snoozeDispatchState, "claimed");
});

test("explicit push failure releases snooze claim as failed", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads, { failCode: "invalid_subscription" });
	const pushClients = new MemoryCollection({ [clientId]: makeClient("12:30") });
	const checkins = new MemoryCollection();
	const { snoozeCheckin } = require("./checkins");
	await snoozeCheckin(checkins, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"));
	const result = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:50:00.000Z"),
		db: mockDb,
	});
	const record = checkins.store.get(`${clientId}_2026-06-15_lunch`);
	assert.equal(result.failed, 1);
	assert.equal(sentPayloads.length, 0);
	assert.equal(record.snoozeDispatchState, "failed");
	assert.equal(record.snoozeDispatchToken, null);
});

test("delivered snooze is not sent again", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const checkins = new MemoryCollection({
		[`${clientId}_2026-06-15_lunch`]: makeRecord("lunch", {
			status: "snoozed",
			snoozedUntil: "2026-06-15T03:50:00.000Z",
			snoozeDeliveredAt: "2026-06-15T03:50:05.000Z",
			snoozeDispatchState: "delivered",
		}),
	});
	const result = await processClient({
		collection: new MemoryCollection({ [clientId]: makeClient("12:30") }),
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:51:00.000Z"),
		db: mockDb,
	});
	assert.equal(result.sent, 0);
	assert.equal(sentPayloads.length, 0);
});

test("normal reminders fail open when checkin read or create fails and still update lastSent", async () => {
	for (const options of [{ failGet: true }, { failSet: true }]) {
		const sentPayloads = [];
		const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
		const pushClients = new MemoryCollection({ [clientId]: makeClient() });
		const result = await processClient({
			collection: pushClients,
			checkinsCollection: new MemoryCollection({}, options),
			client: makeClient(),
			now: new Date("2026-06-15T04:00:00.000Z"),
		});
		assert.equal(result.sent, 1);
		assert.equal(sentPayloads.length, 1);
		assert.equal(pushClients.store.get(clientId).lastSent.lunch, "2026-06-15:12:00");
	}
});

test("normal reminder updates lastSent even when checkin update fails", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const pushClients = new MemoryCollection({ [clientId]: makeClient() });
	const result = await processClient({
		collection: pushClients,
		checkinsCollection: new MemoryCollection({}, { failDocUpdate: true }),
		client: makeClient(),
		now: new Date("2026-06-15T04:00:00.000Z"),
	});
	assert.equal(result.sent, 1);
	assert.equal(pushClients.store.get(clientId).lastSent.lunch, "2026-06-15:12:00");
});

test("snooze respects meal enabled skipped date weekdays only and allowed settings", async () => {
	const cases = [
		{ client: makeClient("12:30", { lunch: { time: "12:30", enabled: false, title: "lunch", subtitle: "body" } }), now: "2026-06-15T03:50:00.000Z", localDate: "2026-06-15", sent: 0 },
		{ client: makeClient("12:30", { skippedDate: "2026-06-15" }), now: "2026-06-15T03:50:00.000Z", localDate: "2026-06-15", sent: 0 },
		{ client: makeClient("12:30", { weekdaysOnly: true }), now: "2026-06-14T03:50:00.000Z", localDate: "2026-06-14", sent: 0 },
		{ client: makeClient("12:30", { weekdaysOnly: true }), now: "2026-06-15T03:50:00.000Z", localDate: "2026-06-15", sent: 1 },
	];
	for (const item of cases) {
		const sentPayloads = [];
		const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
		const checkins = new MemoryCollection();
		const { snoozeCheckin } = require("./checkins");
		await snoozeCheckin(checkins, { ...baseInput, localDate: item.localDate }, 20, new Date(new Date(item.now).getTime() - 20 * 60_000));
		const result = await processClient({
			collection: new MemoryCollection({ [clientId]: item.client }),
			checkinsCollection: checkins,
			client: item.client,
			now: new Date(item.now),
			db: mockDb,
		});
		assert.equal(result.sent, item.sent);
		assert.equal(sentPayloads.length, item.sent);
	}
});

test("snooze accepts 20 and 30 minutes and rejects other values", async () => {
	const { snoozeCheckin } = require("./checkins");
	for (const minutes of [20, 30]) {
		const record = await snoozeCheckin(new MemoryCollection(), baseInput, minutes, new Date("2026-06-15T04:00:00.000Z"));
		assert.equal(record.snoozeMinutes, minutes);
	}
	await assert.rejects(() => snoozeCheckin(new MemoryCollection(), baseInput, 25), /invalid_snooze_minutes/);
});

test("validation rejects invalid uuid date meal type and scheduled time inputs", () => {
	const { assertClientId, assertDate, assertMealType, assertTime } = require("./validation");
	assert.throws(() => assertClientId("not-a-uuid"), /invalid_client_id/);
	assert.throws(() => assertDate("2026-02-31"), /invalid_date/);
	assert.throws(() => assertMealType("snack"), /invalid_meal_type/);
	assert.throws(() => assertTime("25:00"), /invalid_time/);
});

test("history query isolates client ids and db.command path uses range conditions", async () => {
	const otherClientId = "123e4567-e89b-12d3-a456-426614174001";
	const collection = new MemoryCollection();
	const { completeCheckin, listHistoryCheckins } = require("./checkins");
	await completeCheckin(collection, baseInput);
	await completeCheckin(collection, { ...baseInput, clientId: otherClientId });
	const records = await listHistoryCheckins(collection, clientId, "2026-06-09", "2026-06-15", mockDb);
	assert.equal(records.length, 1);
	assert.equal(records[0].clientId, clientId);
});

test("public checkin record does not include push subscription sensitive fields", async () => {
	const { completeCheckin, toPublicRecord } = require("./checkins");
	const record = await completeCheckin(new MemoryCollection(), baseInput);
	const publicRecord = toPublicRecord({
		...record,
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: "internal-token",
		snoozeDispatchClaimedAt: "2026-06-15T04:00:00.000Z",
	});
	const text = JSON.stringify(publicRecord);
	assert.equal(text.includes("endpoint"), false);
	assert.equal(text.includes("p256dh"), false);
	assert.equal(text.includes("auth"), false);
	assert.equal(text.includes("VAPID_PRIVATE_KEY"), false);
	assert.equal(Object.hasOwn(publicRecord, "snoozeDispatchState"), false);
	assert.equal(Object.hasOwn(publicRecord, "snoozeDispatchToken"), false);
	assert.equal(Object.hasOwn(publicRecord, "snoozeDispatchClaimedAt"), false);
});

test("mock rejects immutable CloudBase fields in set and update data", async () => {
	const collection = new MemoryCollection({
		test: { _id: "test", _openid: "owner", status: "pending" },
	});
	await assert.rejects(
		() => collection.doc("test").set({ _id: "test", status: "pending" }),
		(error) => error.code === "INVALID_PARAM" && error.message === "不能更新_id的值",
	);
	await assert.rejects(
		() => collection.doc("test").update({ _id: "other", status: "completed" }),
		(error) => error.code === "INVALID_PARAM" && error.message === "不能更新_id的值",
	);
	await assert.rejects(
		() => collection.where({ _id: "test" }).update({ _openid: "other" }),
		(error) => error.code === "INVALID_PARAM" && error.message === "不能更新_openid的值",
	);
	assert.equal(collection.store.get("test").status, "pending");
	assert.equal(collection.updateCalls.length, 0);
	assert.equal(collection.setCalls.length, 0);
});

test("checkin update operations only send mutable data fields", async () => {
	const {
		claimSnoozeDispatch,
		completeCheckin,
		finalizeSnoozeDelivered,
		releaseSnoozeDispatch,
		skipCheckin,
		snoozeCheckin,
	} = require("./checkins");

	const completedCollection = new MemoryCollection();
	const completed = await completeCheckin(completedCollection, baseInput, new Date("2026-06-15T04:00:00.000Z"), mockDb);
	assert.equal(completed.status, "completed");
	assertNoImmutableUpdateFields(completedCollection);
	assertOnlyMutableCheckinFields(completedCollection);

	const skippedCollection = new MemoryCollection();
	const skipped = await skipCheckin(skippedCollection, baseInput, "other", new Date("2026-06-15T04:00:00.000Z"), mockDb);
	assert.equal(skipped.status, "skipped");
	assertNoImmutableUpdateFields(skippedCollection);
	assertOnlyMutableCheckinFields(skippedCollection);

	const snoozedCollection = new MemoryCollection();
	const snoozed = await snoozeCheckin(snoozedCollection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	assert.equal(snoozed.status, "snoozed");
	assertNoImmutableUpdateFields(snoozedCollection);
	assertOnlyMutableCheckinFields(snoozedCollection);

	const finalizeCollection = new MemoryCollection();
	const finalizeSnoozed = await snoozeCheckin(finalizeCollection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	const claimedForFinalize = await claimSnoozeDispatch(finalizeCollection, finalizeSnoozed, new Date("2026-06-15T03:50:00.000Z"), mockDb, "finalize-token");
	const finalized = await finalizeSnoozeDelivered(finalizeCollection, claimedForFinalize, new Date("2026-06-15T03:51:00.000Z"), mockDb, "finalize-token");
	assert.equal(claimedForFinalize.snoozeDispatchState, "claimed");
	assert.equal(finalized.status, "pending");
	assert.equal(finalized.snoozeDispatchState, "delivered");
	assertNoImmutableUpdateFields(finalizeCollection);
	assertOnlyMutableCheckinFields(finalizeCollection);

	const releaseCollection = new MemoryCollection();
	const releaseSnoozed = await snoozeCheckin(releaseCollection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	const claimedForRelease = await claimSnoozeDispatch(releaseCollection, releaseSnoozed, new Date("2026-06-15T03:50:00.000Z"), mockDb, "release-token");
	const released = await releaseSnoozeDispatch(releaseCollection, claimedForRelease, new Date("2026-06-15T03:51:00.000Z"), mockDb, "release-token");
	assert.equal(claimedForRelease.snoozeDispatchState, "claimed");
	assert.equal(released.snoozeDispatchState, "failed");
	assert.equal(releaseCollection.store.get(`${clientId}_2026-06-15_lunch`).snoozeDispatchToken, null);
	assertNoImmutableUpdateFields(releaseCollection);
	assertOnlyMutableCheckinFields(releaseCollection);
});

test("creating a pending checkin omits immutable fields from set data", async () => {
	const collection = new MemoryCollection();
	const { completeCheckin, getCheckinId } = require("./checkins");
	const record = await completeCheckin(collection, baseInput, new Date("2026-06-15T04:00:00.000Z"), mockDb);
	const id = getCheckinId(clientId, "2026-06-15", "lunch");
	assert.equal(record._id, id);
	assert.equal(collection.store.get(id)._id, id);
	assertNoImmutableSetFields(collection);
	assertNoImmutableUpdateFields(collection);
	assertOnlyMutableCheckinFields(collection);
});

test("existing records with immutable fields still update using pure patch data", async () => {
	const {
		claimSnoozeDispatch,
		completeCheckin,
		finalizeSnoozeDelivered,
		releaseSnoozeDispatch,
		skipCheckin,
		snoozeCheckin,
	} = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	const seed = (overrides = {}) => new MemoryCollection({
		[id]: makeRecord("lunch", { _openid: "owner-openid", ...overrides }),
	});

	const completeCollection = seed({ status: "pending" });
	const completed = await completeCheckin(completeCollection, baseInput, new Date("2026-06-15T04:00:00.000Z"), mockDb);
	assert.equal(completed.status, "completed");
	assert.equal(completeCollection.store.get(id)._openid, "owner-openid");
	assertNoImmutableUpdateFields(completeCollection);
	assertOnlyMutableCheckinFields(completeCollection);

	const skipCollection = seed({ status: "pending" });
	const skipped = await skipCheckin(skipCollection, baseInput, "other", new Date("2026-06-15T04:00:00.000Z"), mockDb);
	assert.equal(skipped.status, "skipped");
	assertNoImmutableUpdateFields(skipCollection);
	assertOnlyMutableCheckinFields(skipCollection);

	const snoozeCollection = seed({ status: "pending" });
	const snoozed = await snoozeCheckin(snoozeCollection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	assert.equal(snoozed.status, "snoozed");
	assertNoImmutableUpdateFields(snoozeCollection);
	assertOnlyMutableCheckinFields(snoozeCollection);

	const claimCollection = seed({
		status: "snoozed",
		snoozedUntil: "2026-06-15T03:50:00.000Z",
		snoozeMinutes: 20,
	});
	const claimed = await claimSnoozeDispatch(claimCollection, claimCollection.store.get(id), new Date("2026-06-15T03:50:00.000Z"), mockDb, "claim-token");
	assert.equal(claimed.snoozeDispatchState, "claimed");
	assert.equal(claimCollection.store.get(id).snoozeDispatchToken, "claim-token");
	assertNoImmutableUpdateFields(claimCollection);
	assertOnlyMutableCheckinFields(claimCollection);

	const finalizeCollection = seed({
		status: "snoozed",
		snoozedUntil: "2026-06-15T03:50:00.000Z",
		snoozeMinutes: 20,
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: "finalize-token",
		snoozeDispatchClaimedAt: "2026-06-15T03:50:00.000Z",
	});
	const finalized = await finalizeSnoozeDelivered(finalizeCollection, finalizeCollection.store.get(id), new Date("2026-06-15T03:51:00.000Z"), mockDb, "finalize-token");
	assert.equal(finalized.status, "pending");
	assert.equal(finalized.snoozeDispatchState, "delivered");
	assertNoImmutableUpdateFields(finalizeCollection);
	assertOnlyMutableCheckinFields(finalizeCollection);

	const releaseCollection = seed({
		status: "snoozed",
		snoozedUntil: "2026-06-15T03:50:00.000Z",
		snoozeMinutes: 20,
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: "release-token",
		snoozeDispatchClaimedAt: "2026-06-15T03:50:00.000Z",
	});
	const released = await releaseSnoozeDispatch(releaseCollection, releaseCollection.store.get(id), new Date("2026-06-15T03:51:00.000Z"), mockDb, "release-token");
	assert.equal(released.snoozeDispatchState, "failed");
	assert.equal(releaseCollection.store.get(id).snoozeDispatchToken, null);
	assertNoImmutableUpdateFields(releaseCollection);
	assertOnlyMutableCheckinFields(releaseCollection);
});

test("stale snooze cannot overwrite a completed checkin", async () => {
	const { completeCheckin, snoozeCheckin } = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	const collection = new MemoryCollection({
		[id]: makeRecord("lunch", { status: "pending" }),
	}, {
		beforeWhereUpdate: onceBeforeUpdate(async ({ collection: activeCollection }) => {
			await completeCheckin(activeCollection, baseInput, new Date("2026-06-15T04:01:00.000Z"), mockDb);
		}),
	});
	const result = await snoozeCheckin(collection, baseInput, 20, new Date("2026-06-15T04:00:00.000Z"), mockDb);
	const stored = collection.store.get(id);
	assert.equal(result.status, "completed");
	assert.equal(stored.status, "completed");
	assert.equal(stored.snoozedUntil, null);
});

test("complete and skip concurrent stale writes preserve the first final status", async () => {
	const { completeCheckin, skipCheckin } = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	const completedFirst = new MemoryCollection({
		[id]: makeRecord("lunch", { status: "pending" }),
	}, {
		beforeWhereUpdate: onceBeforeUpdate(async ({ collection: activeCollection }) => {
			await completeCheckin(activeCollection, baseInput, new Date("2026-06-15T04:01:00.000Z"), mockDb);
		}),
	});
	const staleSkip = await skipCheckin(completedFirst, baseInput, "other", new Date("2026-06-15T04:02:00.000Z"), mockDb);
	assert.equal(staleSkip.status, "completed");
	assert.equal(completedFirst.store.get(id).status, "completed");

	const skippedFirst = new MemoryCollection({
		[id]: makeRecord("lunch", { status: "pending" }),
	}, {
		beforeWhereUpdate: onceBeforeUpdate(async ({ collection: activeCollection }) => {
			await skipCheckin(activeCollection, baseInput, "not_hungry", new Date("2026-06-15T04:01:00.000Z"), mockDb);
		}),
	});
	const staleComplete = await completeCheckin(skippedFirst, baseInput, new Date("2026-06-15T04:02:00.000Z"), mockDb);
	assert.equal(staleComplete.status, "skipped");
	assert.equal(skippedFirst.store.get(id).status, "skipped");
});

test("stale complete or snooze cannot overwrite an already skipped checkin", async () => {
	const { completeCheckin, skipCheckin, snoozeCheckin } = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	for (const action of ["complete", "snooze"]) {
		const collection = new MemoryCollection({
			[id]: makeRecord("lunch", { status: "pending" }),
		}, {
			beforeWhereUpdate: onceBeforeUpdate(async ({ collection: activeCollection }) => {
				await skipCheckin(activeCollection, baseInput, "other", new Date("2026-06-15T04:01:00.000Z"), mockDb);
			}),
		});
		const result = action === "complete"
			? await completeCheckin(collection, baseInput, new Date("2026-06-15T04:02:00.000Z"), mockDb)
			: await snoozeCheckin(collection, baseInput, 20, new Date("2026-06-15T04:02:00.000Z"), mockDb);
		const stored = collection.store.get(id);
		assert.equal(result.status, "skipped");
		assert.equal(stored.status, "skipped");
		assert.equal(stored.snoozedUntil, null);
	}
});

test("snooze finalize and release require the claimed token", async () => {
	const {
		claimSnoozeDispatch,
		finalizeSnoozeDelivered,
		releaseSnoozeDispatch,
		snoozeCheckin,
	} = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	const collection = new MemoryCollection();
	const snoozed = await snoozeCheckin(collection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	const claimed = await claimSnoozeDispatch(collection, snoozed, new Date("2026-06-15T03:50:00.000Z"), mockDb, "claim-token");

	assert.equal(await finalizeSnoozeDelivered(collection, claimed, new Date("2026-06-15T03:51:00.000Z"), mockDb, "wrong-token"), null);
	assert.equal(collection.store.get(id).snoozeDispatchState, "claimed");
	assert.equal(collection.store.get(id).snoozeDispatchToken, "claim-token");
	assert.equal(await releaseSnoozeDispatch(collection, claimed, new Date("2026-06-15T03:52:00.000Z"), mockDb, "wrong-token"), null);
	assert.equal(collection.store.get(id).snoozeDispatchState, "claimed");

	const finalized = await finalizeSnoozeDelivered(collection, claimed, new Date("2026-06-15T03:53:00.000Z"), mockDb, "claim-token");
	assert.equal(finalized.status, "pending");
	assert.equal(finalized.snoozeDispatchState, "delivered");
	assert.equal(collection.store.get(id).reminderCount, 1);
	assert.equal(await finalizeSnoozeDelivered(collection, claimed, new Date("2026-06-15T03:54:00.000Z"), mockDb, "claim-token"), null);
	assert.equal(collection.store.get(id).reminderCount, 1);
});

test("released snooze claim cannot be finalized with the old token", async () => {
	const {
		claimSnoozeDispatch,
		finalizeSnoozeDelivered,
		releaseSnoozeDispatch,
		snoozeCheckin,
	} = require("./checkins");
	const id = `${clientId}_2026-06-15_lunch`;
	const collection = new MemoryCollection();
	const snoozed = await snoozeCheckin(collection, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"), mockDb);
	const claimed = await claimSnoozeDispatch(collection, snoozed, new Date("2026-06-15T03:50:00.000Z"), mockDb, "release-token");
	const released = await releaseSnoozeDispatch(collection, claimed, new Date("2026-06-15T03:51:00.000Z"), mockDb, "release-token");
	assert.equal(released.snoozeDispatchState, "failed");
	assert.equal(collection.store.get(id).snoozeDispatchToken, null);
	assert.equal(await finalizeSnoozeDelivered(collection, claimed, new Date("2026-06-15T03:52:00.000Z"), mockDb, "release-token"), null);
	assert.equal(collection.store.get(id).snoozeDispatchState, "failed");
	assert.equal(collection.store.get(id).snoozeDeliveredAt, null);
});

test("existing push api routes remain present", () => {
	const apiSource = fs.readFileSync(path.resolve(__dirname, "../push-api/index.js"), "utf8");
	for (const route of [
		"/api/health",
		"/api/vapid-public-key",
		"/api/subscriptions",
		"/api/subscriptions/:clientId/settings",
		"/api/subscriptions/:clientId/diagnostics",
		"/api/subscriptions/:clientId/test",
		"/api/subscriptions/:clientId/test-empty",
	]) {
		assert.equal(apiSource.includes(route), true, route);
	}
	assert.equal(apiSource.includes("invalid_action"), true);
});

test("push api origin guard allows known origins without function-level ACAO and rejects unknown origins", async (t) => {
	const port = await getFreePort();
	const child = startPushApiProcess(port);
	t.after(() => stopChildProcess(child));
	await waitForPushApi(port, child);

	for (const origin of [currentProductionOrigin, legacyProductionOrigin, localhostOrigin]) {
		const response = await httpRequest({
			port,
			method: "GET",
			pathname: "/api/health",
			headers: { Origin: origin },
		});
		assert.equal(response.statusCode, 200, origin);
		assert.equal(response.headers["access-control-allow-origin"], undefined);
	}

	const options = await httpRequest({
		port,
		method: "OPTIONS",
		pathname: "/api/health",
		headers: {
			Origin: currentProductionOrigin,
			"Access-Control-Request-Method": "GET",
		},
	});
	assert.equal(options.statusCode, 204);
	assert.equal(options.headers["access-control-allow-origin"], undefined);
	assert.equal(options.headers["access-control-allow-methods"], undefined);
	assert.equal(options.headers["access-control-allow-headers"], undefined);

	const rejectedGet = await httpRequest({
		port,
		method: "GET",
		pathname: "/api/health",
		headers: { Origin: "https://evil.example" },
	});
	assert.equal(rejectedGet.statusCode, 403);
	assert.match(rejectedGet.body, /origin_not_allowed/);

	const rejectedOptions = await httpRequest({
		port,
		method: "OPTIONS",
		pathname: "/api/health",
		headers: {
			Origin: "https://evil.example",
			"Access-Control-Request-Method": "GET",
		},
	});
	assert.equal(rejectedOptions.statusCode, 403);
	assert.match(rejectedOptions.body, /origin_not_allowed/);
});

test("push api module load does not listen and startServer binds configured port on all interfaces", () => {
	const deployDir = path.resolve(__dirname, "../../deploy/push-api");
	const script = `
		const http = require("node:http");
		const calls = [];
		http.Server.prototype.listen = function listen(port, host, callback) {
			calls.push({ port, host });
			if (typeof callback === "function") callback();
			return { on() { return this; }, close() {} };
		};
		const mod = require("./index.js");
		if (calls.length !== 0) throw new Error("module_load_started_server");
		if (!mod.main || !mod.app || !mod.startServer) throw new Error("missing_exports");
		mod.startServer();
		console.log(JSON.stringify(calls));
	`;
	const result = spawnSync(process.execPath, ["-e", script], {
		cwd: deployDir,
		env: { ...process.env, PORT: "39123" },
		encoding: "utf8",
		timeout: 5_000,
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const calls = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
	assert.deepEqual(calls, [{ port: 39123, host: "0.0.0.0" }]);
});

function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => resolve(address.port));
		});
	});
}

function startPushApiProcess(port) {
	const deployDir = path.resolve(__dirname, "../../deploy/push-api");
	const child = spawn(process.execPath, ["index.js"], {
		cwd: deployDir,
		env: {
			...process.env,
			PORT: String(port),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.output = { stdout: "", stderr: "" };
	child.stdout.on("data", (chunk) => {
		child.output.stdout += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		child.output.stderr += chunk.toString();
	});
	return child;
}

function stopChildProcess(child) {
	if (!child || child.killed || child.exitCode !== null) return;
	child.kill();
}

async function waitForPushApi(port, child) {
	const deadline = Date.now() + 5_000;
	let lastError;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`push_api_exited_early:${child.exitCode}:${child.output.stderr || child.output.stdout}`);
		}
		try {
			const response = await httpRequest({ port, method: "GET", pathname: "/api/health" });
			if (response.statusCode === 200) return;
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`push_api_start_timeout:${lastError?.message || ""}:${child.output.stderr || child.output.stdout}`);
}

function httpRequest({ port, method, pathname, headers = {} }) {
	return new Promise((resolve, reject) => {
		const request = http.request({
			host: "127.0.0.1",
			port,
			path: pathname,
			method,
			headers,
			timeout: 2_000,
		}, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				body += chunk;
			});
			response.on("end", () => {
				resolve({
					statusCode: response.statusCode,
					headers: response.headers,
					body,
				});
			});
		});
		request.on("error", reject);
		request.on("timeout", () => {
			request.destroy(new Error("request_timeout"));
		});
		request.end();
	});
}

function makeRecord(mealType, overrides = {}) {
	return {
		_id: `${clientId}_2026-06-15_${mealType}`,
		version: 1,
		clientId,
		mealType,
		localDate: "2026-06-15",
		timezone: "Asia/Shanghai",
		scheduledTime: "12:00",
		status: "pending",
		completedAt: null,
		snoozedUntil: null,
		snoozeMinutes: null,
		snoozeDeliveredAt: null,
		snoozeDispatchState: null,
		snoozeDispatchToken: null,
		snoozeDispatchClaimedAt: null,
		skipReason: null,
		note: null,
		firstReminderAt: null,
		lastReminderAt: null,
		reminderCount: 0,
		createdAt: "2026-06-15T03:30:00.000Z",
		updatedAt: "2026-06-15T03:30:00.000Z",
		...overrides,
	};
}

const loadDateUtilsWithPushMock = (sentPayloads, options = {}) => {
	const dateUtilsPath = path.resolve(__dirname, "date-utils.js");
	const pushPath = path.resolve(__dirname, "push.js");
	delete require.cache[dateUtilsPath];
	require.cache[pushPath] = {
		id: pushPath,
		filename: pushPath,
		loaded: true,
		exports: {
			reminderPayload: (mealType, title, body, localDate) => ({
				title,
				body,
				data: { type: "meal-reminder", mealType, localDate, url: `/?checkin=${mealType}&date=${localDate}` },
			}),
			sendPushPayload: async (_client, payload) => {
				if (options.failCode) {
					const error = new Error("mock_push_failed");
					error.code = options.failCode;
					throw error;
				}
				sentPayloads.push(payload);
				return { ok: true, statusCode: 201 };
			},
		},
	};
	return require(dateUtilsPath);
};

const loadSchedulerMainWithProcessMock = (clients, processResults) => {
	const schedulerPath = path.resolve(__dirname, "../push-scheduler/index.js");
	const dateUtilsPath = path.resolve(__dirname, "date-utils.js");
	delete require.cache[schedulerPath];
	delete require.cache[dateUtilsPath];

	const processed = [];
	require.cache[dateUtilsPath] = {
		id: dateUtilsPath,
		filename: dateUtilsPath,
		loaded: true,
		exports: {
			processClient: async ({ client }) => {
				processed.push(client.clientId);
				const result = processResults.shift();
				if (result instanceof Error) throw result;
				return result;
			},
		},
	};

	const pushClients = new MemoryCollection(
		Object.fromEntries(clients.map((client, index) => [client.clientId || `mock-client-${index}`, client])),
	);
	const checkins = new MemoryCollection();
	const originalLoad = Module._load;
	Module._load = function loadMocked(request, parent, isMain) {
		if (request === "@cloudbase/node-sdk") {
			return {
				SYMBOL_CURRENT_ENV: "mock-current-env",
				init: () => ({
					database: () => ({
						collection: (name) => name === "push_clients" ? pushClients : checkins,
					}),
				}),
			};
		}
		return originalLoad.call(this, request, parent, isMain);
	};
	try {
		const { main } = require(schedulerPath);
		return { main, processed };
	} finally {
		Module._load = originalLoad;
		delete require.cache[dateUtilsPath];
		delete require.cache[schedulerPath];
	}
};

test("completed checkin creates one deterministic record and repeated complete is idempotent", async () => {
	const collection = new MemoryCollection();
	const { completeCheckin, getCheckinId } = require("./checkins");
	const first = await completeCheckin(collection, baseInput, new Date("2026-06-15T04:00:00.000Z"));
	const second = await completeCheckin(collection, baseInput, new Date("2026-06-15T04:05:00.000Z"));
	assert.equal(first._id, getCheckinId(clientId, "2026-06-15", "lunch"));
	assert.equal(collection.store.size, 1);
	assert.equal(second.completedAt, first.completedAt);
	assert.equal(second.status, "completed");
});

test("snooze minutes are limited and snoozedUntil is computed from server time", async () => {
	const collection = new MemoryCollection();
	const { snoozeCheckin } = require("./checkins");
	const record = await snoozeCheckin(collection, baseInput, 10, new Date("2026-06-15T04:00:00.000Z"));
	assert.equal(record.snoozedUntil, "2026-06-15T04:10:00.000Z");
	await assert.rejects(() => snoozeCheckin(collection, { ...baseInput, mealType: "breakfast" }, 15), /invalid_snooze_minutes/);
});

test("skip reason is validated", async () => {
	const collection = new MemoryCollection();
	const { skipCheckin } = require("./checkins");
	await assert.rejects(() => skipCheckin(collection, baseInput, "busy"), /invalid_skip_reason/);
	const record = await skipCheckin(collection, baseInput, "not_hungry");
	assert.equal(record.status, "skipped");
});

test("today and seven-day history queries return client-scoped sorted records and reject long ranges", async () => {
	const collection = new MemoryCollection();
	const { completeCheckin, listHistoryCheckins, listTodayCheckins } = require("./checkins");
	await completeCheckin(collection, { ...baseInput, mealType: "breakfast", scheduledTime: "08:00" });
	await completeCheckin(collection, { ...baseInput, mealType: "dinner", scheduledTime: "18:00" });
	await completeCheckin(collection, { ...baseInput, localDate: "2026-06-14" });
	const today = await listTodayCheckins(collection, clientId, "2026-06-15");
	assert.deepEqual(today.map((record) => record.mealType), ["breakfast", "dinner"]);
	const history = await listHistoryCheckins(collection, clientId, "2026-06-09", "2026-06-15");
	assert.equal(history.length, 3);
	assert.equal(history[0].localDate, "2026-06-15");
	await assert.rejects(() => listHistoryCheckins(collection, clientId, "2026-05-01", "2026-06-15"), /invalid_date_range/);
});

test("scheduler skips completed and skipped meals, sends pending meals, and updates lastSent", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const pushClients = new MemoryCollection({ [clientId]: makeClient() });
	const checkins = new MemoryCollection();
	const { completeCheckin, skipCheckin } = require("./checkins");
	await completeCheckin(checkins, { ...baseInput, mealType: "breakfast", scheduledTime: "08:00" });
	await skipCheckin(checkins, { ...baseInput, mealType: "dinner", scheduledTime: "18:00" }, "other");
	const result = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient(),
		now: new Date("2026-06-15T04:00:00.000Z"),
	});
	assert.equal(result.sent, 1);
	assert.equal(sentPayloads.length, 1);
	assert.equal(sentPayloads[0].data.mealType, "lunch");
	assert.equal(pushClients.store.get(clientId).lastSent.lunch, "2026-06-15:12:00");
});

test("scheduler main continues after one client processing failure", async () => {
	const firstClientId = "123e4567-e89b-12d3-a456-426614174010";
	const secondClientId = "123e4567-e89b-12d3-a456-426614174011";
	const { main, processed } = loadSchedulerMainWithProcessMock(
		[
			{ ...makeClient(), clientId: firstClientId },
			{ ...makeClient(), clientId: secondClientId },
		],
		[
			new Error("mock_client_failed"),
			{ sent: 1, removed: 0, failed: 0 },
		],
	);
	const summary = await main({ type: "test" });
	assert.deepEqual(processed, [firstClientId, secondClientId]);
	assert.equal(summary.scanned, 2);
	assert.equal(summary.sent, 1);
	assert.equal(summary.failed, 1);
});

test("scheduler does not send snooze early and sends due snooze only once", async () => {
	const sentPayloads = [];
	const { processClient } = loadDateUtilsWithPushMock(sentPayloads);
	const pushClients = new MemoryCollection({ [clientId]: makeClient("12:30") });
	const checkins = new MemoryCollection();
	const { snoozeCheckin } = require("./checkins");
	await snoozeCheckin(checkins, baseInput, 20, new Date("2026-06-15T03:30:00.000Z"));
	const early = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:45:00.000Z"),
	});
	assert.equal(early.sent, 0);
	const due = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:50:00.000Z"),
	});
	const repeated = await processClient({
		collection: pushClients,
		checkinsCollection: checkins,
		client: makeClient("12:30"),
		now: new Date("2026-06-15T03:51:00.000Z"),
	});
	assert.equal(due.sent, 1);
	assert.equal(repeated.sent, 0);
	assert.equal(sentPayloads.length, 1);
assert.equal(sentPayloads[0].body, "\u4f60\u8bbe\u7f6e\u7684\u7a0d\u540e\u63d0\u9192\u65f6\u95f4\u5230\u4e86\uff0c\u8bb0\u5f97\u5403\u996d\u5440\uff5e");
});
