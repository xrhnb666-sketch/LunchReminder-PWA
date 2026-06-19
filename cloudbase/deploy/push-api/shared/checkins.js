const { randomBytes, randomUUID } = require("node:crypto");
const { BadRequest } = require("./errors");
const {
	assertDate,
	assertMealType,
	assertSkipReason,
	assertSnoozeMinutes,
	assertTime,
	assertTimezone,
	mealTypes,
} = require("./validation");

const statusOrder = {
	pending: 0,
	completed: 1,
	snoozed: 2,
	skipped: 3,
};

const mealOrder = Object.fromEntries(mealTypes.map((mealType, index) => [mealType, index]));

const getCheckinId = (clientId, localDate, mealType) => `${clientId}_${localDate}_${mealType}`;

const immutableUpdateFields = new Set(["_id", "_openid"]);
const persistedCheckinFields = [
	"version",
	"clientId",
	"mealType",
	"localDate",
	"timezone",
	"scheduledTime",
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
	"createdAt",
	"updatedAt",
];
const mutableCheckinFields = new Set([
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

const makeInvalidUpdateFieldError = (field) => {
	const error = new Error(`invalid_update_field:${field}`);
	error.code = "INVALID_PARAM";
	return error;
};

const buildCheckinSetData = (record) =>
	Object.fromEntries(persistedCheckinFields.map((field) => [field, record[field]]));

const buildCheckinUpdateData = (patch) => {
	if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw makeInvalidUpdateFieldError("patch");
	const data = {};
	for (const [field, value] of Object.entries(patch)) {
		if (immutableUpdateFields.has(field) || !mutableCheckinFields.has(field)) {
			throw makeInvalidUpdateFieldError(field);
		}
		data[field] = value;
	}
	return data;
};

const asIso = (value) => {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string") return new Date(value).toISOString();
	return new Date().toISOString();
};

const getDocData = (result) => {
	if (Array.isArray(result?.data)) return result.data[0] ?? null;
	return result?.data ?? null;
};

const getCheckin = async (collection, clientId, localDate, mealType) => {
	const result = await collection.doc(getCheckinId(clientId, localDate, mealType)).get();
	return getDocData(result);
};

const buildPendingRecord = ({ clientId, localDate, mealType, timezone, scheduledTime, now }) => {
	const timestamp = asIso(now);
	return {
		_id: getCheckinId(clientId, localDate, mealType),
		version: 1,
		clientId,
		mealType,
		localDate,
		timezone,
		scheduledTime,
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
		createdAt: timestamp,
		updatedAt: timestamp,
	};
};

const normalizeCheckinInput = ({ clientId, localDate, mealType, timezone, scheduledTime }) => ({
	clientId,
	localDate: assertDate(localDate),
	mealType: assertMealType(mealType),
	timezone: assertTimezone(timezone),
	scheduledTime: assertTime(scheduledTime),
});

const createOrGetPending = async (collection, input, now = new Date()) => {
	const normalized = normalizeCheckinInput(input);
	const existing = await getCheckin(collection, normalized.clientId, normalized.localDate, normalized.mealType);
	if (existing) return existing;
	const record = buildPendingRecord({ ...normalized, now });
	await collection.doc(record._id).set(buildCheckinSetData(record));
	return record;
};

const updateRecord = async (collection, record, patch) => {
	const data = buildCheckinUpdateData(patch);
	await collection.doc(record._id).update(data);
	return { ...record, ...data };
};

const getCheckinById = async (collection, id) => {
	const result = await collection.doc(id).get();
	return getDocData(result);
};

const getUpdatedCount = (result) => Number(result?.updated ?? result?.stats?.updated ?? result?.modified ?? 0);

const mutableStatusCondition = (db) => {
	if (db?.command) {
		const _ = db.command;
		return _.neq("completed").and(_.neq("skipped"));
	}
	return (status) => status !== "completed" && status !== "skipped";
};

const nullCondition = (db) => db?.command ? db.command.eq(null) : (value) => value === null;

const conditionalUpdateRecord = async (collection, record, query, patch) => {
	if (typeof collection.where !== "function") throw new Error("conditional_update_unsupported");
	const data = buildCheckinUpdateData(patch);
	const result = await collection.where({ _id: record._id, ...query }).update(data);
	if (getUpdatedCount(result) !== 1) return null;
	return { ...record, ...data };
};

const returnCurrentWhenNotUpdated = async (collection, record, updated) =>
	updated || await getCheckinById(collection, record._id) || record;

const completeCheckin = async (collection, input, now = new Date(), db) => {
	const record = await createOrGetPending(collection, input, now);
	if (record.status === "completed" || record.status === "skipped") return record;
	const timestamp = asIso(now);
	const updated = await conditionalUpdateRecord(collection, record, { status: mutableStatusCondition(db) }, {
		status: "completed",
		completedAt: record.completedAt ?? timestamp,
		snoozedUntil: null,
		snoozeMinutes: null,
		snoozeDeliveredAt: null,
		snoozeDispatchState: null,
		snoozeDispatchToken: null,
		snoozeDispatchClaimedAt: null,
		skipReason: null,
		updatedAt: timestamp,
	});
	return returnCurrentWhenNotUpdated(collection, record, updated);
};

const snoozeCheckin = async (collection, input, snoozeMinutes, now = new Date(), db) => {
	const minutes = assertSnoozeMinutes(snoozeMinutes);
	const record = await createOrGetPending(collection, input, now);
	if (record.status === "completed" || record.status === "skipped") return record;
	if (record.status === "snoozed" && record.snoozeMinutes === minutes && !record.snoozeDeliveredAt) {
		return record;
	}
	const timestamp = asIso(now);
	const snoozedUntil = new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
	const updated = await conditionalUpdateRecord(collection, record, { status: mutableStatusCondition(db) }, {
		status: "snoozed",
		snoozedUntil,
		snoozeMinutes: minutes,
		snoozeDeliveredAt: null,
		snoozeDispatchState: null,
		snoozeDispatchToken: null,
		snoozeDispatchClaimedAt: null,
		skipReason: null,
		updatedAt: timestamp,
	});
	return returnCurrentWhenNotUpdated(collection, record, updated);
};

const skipCheckin = async (collection, input, skipReason, now = new Date(), db) => {
	const reason = assertSkipReason(skipReason);
	const record = await createOrGetPending(collection, input, now);
	if (record.status === "completed" || record.status === "skipped") return record;
	const timestamp = asIso(now);
	const updated = await conditionalUpdateRecord(collection, record, { status: mutableStatusCondition(db) }, {
		status: "skipped",
		completedAt: null,
		snoozedUntil: null,
		snoozeMinutes: null,
		snoozeDeliveredAt: null,
		snoozeDispatchState: null,
		snoozeDispatchToken: null,
		snoozeDispatchClaimedAt: null,
		skipReason: reason,
		updatedAt: timestamp,
	});
	return returnCurrentWhenNotUpdated(collection, record, updated);
};

const updateReminderSent = async (collection, record, now = new Date()) => {
	const timestamp = asIso(now);
	return updateRecord(collection, record, {
		firstReminderAt: record.firstReminderAt ?? timestamp,
		lastReminderAt: timestamp,
		reminderCount: Number(record.reminderCount ?? 0) + 1,
		updatedAt: timestamp,
	});
};

const hasActiveSnoozeDispatch = (record) =>
	record?.snoozeDispatchState === "claimed" || record?.snoozeDispatchState === "delivered";

const createDispatchToken = () => {
	if (typeof randomUUID === "function") return randomUUID();
	return randomBytes(16).toString("hex");
};

const claimSnoozeDispatch = async (collection, record, now = new Date(), db, token) => {
	if (!shouldSendSnooze(record, now)) return null;
	const timestamp = asIso(now);
	const dispatchToken = token || createDispatchToken();
	const patch = {
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: dispatchToken,
		snoozeDispatchClaimedAt: timestamp,
		updatedAt: timestamp,
	};
	const _ = db?.command;
	return conditionalUpdateRecord(collection, record, {
		status: "snoozed",
		snoozeDeliveredAt: nullCondition(db),
		snoozeDispatchState: _ ? _.neq("claimed").and(_.neq("delivered")) : (value) => value !== "claimed" && value !== "delivered",
	}, patch);
};

const finalizeSnoozeDelivered = async (collection, record, now = new Date(), db, token) => {
	const dispatchToken = token;
	if (!dispatchToken) return null;
	const timestamp = asIso(now);
	return conditionalUpdateRecord(collection, record, {
		status: "snoozed",
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: dispatchToken,
	}, {
		status: "pending",
		snoozeDeliveredAt: timestamp,
		snoozeDispatchState: "delivered",
		lastReminderAt: timestamp,
		reminderCount: Number(record.reminderCount ?? 0) + 1,
		updatedAt: timestamp,
	});
};

const releaseSnoozeDispatch = async (collection, record, now = new Date(), db, token) => {
	const dispatchToken = token;
	if (!dispatchToken) return null;
	const timestamp = asIso(now);
	return conditionalUpdateRecord(collection, record, {
		status: "snoozed",
		snoozeDispatchState: "claimed",
		snoozeDispatchToken: dispatchToken,
	}, {
		snoozeDispatchState: "failed",
		snoozeDispatchToken: null,
		snoozeDispatchClaimedAt: null,
		updatedAt: timestamp,
	});
};

const listTodayCheckins = async (collection, clientId, localDate) => {
	const records = [];
	for (const mealType of mealTypes) {
		const record = await getCheckin(collection, clientId, localDate, mealType);
		if (record) records.push(record);
	}
	return records.sort(sortRecords);
};

const assertHistoryRange = (from, to) => {
	const fromDate = assertDate(from);
	const toDate = assertDate(to);
	const fromTime = new Date(`${fromDate}T00:00:00.000Z`).getTime();
	const toTime = new Date(`${toDate}T00:00:00.000Z`).getTime();
	if (toTime < fromTime) throw new BadRequest("invalid_date");
	if ((toTime - fromTime) / 86_400_000 > 30) throw new BadRequest("invalid_date_range");
	return { from: fromDate, to: toDate };
};

const sortRecords = (left, right) => {
	const dateCompare = String(right.localDate).localeCompare(String(left.localDate));
	if (dateCompare !== 0) return dateCompare;
	return (mealOrder[left.mealType] ?? 99) - (mealOrder[right.mealType] ?? 99);
};

const listHistoryCheckins = async (collection, clientId, from, to, db) => {
	const range = assertHistoryRange(from, to);
	let records = [];
	if (db?.command) {
		const _ = db.command;
		const result = await collection
			.where({
				clientId,
				localDate: _.gte(range.from).and(_.lte(range.to)),
			})
			.get();
		records = Array.isArray(result.data) ? result.data : [];
	} else {
		const result = await collection.where({ clientId }).get();
		records = Array.isArray(result.data) ? result.data : [];
	}
	return records
		.filter((record) => record.clientId === clientId && record.localDate >= range.from && record.localDate <= range.to)
		.sort(sortRecords);
};

const shouldSendSnooze = (record, now = new Date()) =>
	record?.status === "snoozed" &&
	typeof record.snoozedUntil === "string" &&
	!record.snoozeDeliveredAt &&
	!hasActiveSnoozeDispatch(record) &&
	new Date(record.snoozedUntil).getTime() <= now.getTime();

const toPublicRecord = (record) => ({
	_id: record._id,
	version: record.version,
	clientId: record.clientId,
	mealType: record.mealType,
	localDate: record.localDate,
	timezone: record.timezone,
	scheduledTime: record.scheduledTime,
	status: statusOrder[record.status] === undefined ? "pending" : record.status,
	completedAt: record.completedAt ?? null,
	snoozedUntil: record.snoozedUntil ?? null,
	snoozeMinutes: record.snoozeMinutes ?? null,
	snoozeDeliveredAt: record.snoozeDeliveredAt ?? null,
	skipReason: record.skipReason ?? null,
	note: record.note ?? null,
	firstReminderAt: record.firstReminderAt ?? null,
	lastReminderAt: record.lastReminderAt ?? null,
	reminderCount: Number(record.reminderCount ?? 0),
	createdAt: record.createdAt,
	updatedAt: record.updatedAt,
});

module.exports = {
	assertHistoryRange,
	claimSnoozeDispatch,
	completeCheckin,
	createOrGetPending,
	getCheckin,
	getCheckinId,
	listHistoryCheckins,
	listTodayCheckins,
	finalizeSnoozeDelivered,
	hasActiveSnoozeDispatch,
	releaseSnoozeDispatch,
	shouldSendSnooze,
	skipCheckin,
	snoozeCheckin,
	toPublicRecord,
	updateReminderSent,
};
