const { getSafeErrorDetails } = require("./errors");
const { reminderPayload, sendPushPayload } = require("./push");
const { mealTypes } = require("./validation");
const {
	claimSnoozeDispatch,
	createOrGetPending,
	finalizeSnoozeDelivered,
	getCheckin,
	releaseSnoozeDispatch,
	shouldSendSnooze,
	updateReminderSent,
} = require("./checkins");

const getLocalMinute = (date, timezone) => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		weekday: "short",
	}).formatToParts(date);
	const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	return {
		dateKey: `${map.year}-${map.month}-${map.day}`,
		time: `${map.hour}:${map.minute}`,
		weekday: weekdayMap[map.weekday] ?? 0,
	};
};

const shouldSendMeal = (client, mealType, local) => {
	if (!isMealAllowedBySettings(client, mealType, local)) return false;
	const meal = client.settings[mealType];
	if (meal.time !== local.time) return false;
	return client.lastSent?.[mealType] !== `${local.dateKey}:${local.time}`;
};

const isMealAllowedBySettings = (client, mealType, local) => {
	const settings = client?.settings;
	const meal = settings?.[mealType];
	if (!settings || !meal?.enabled) return false;
	if (settings.skippedDate === local.dateKey) return false;
	if (settings.weekdaysOnly && (local.weekday === 0 || local.weekday === 6)) return false;
	return true;
};

const sendReminder = async ({ client, mealType, localDate, title, body }) => {
	await sendPushPayload(client, reminderPayload(mealType, title, body, localDate));
};

const isAcceptedPushFailure = (code) =>
	["invalid_subscription", "push_subscription_expired", "push_authentication_failed", "vapid_config_missing"].includes(code);

const logSafe = (label, details) => {
	console.error(label, details);
};

const processNormalMeals = async ({ collection, checkinsCollection, client, now, local, lastSent }) => {
	let sent = 0;

	for (const mealType of mealTypes) {
		if (!shouldSendMeal({ ...client, lastSent }, mealType, local)) continue;
		const meal = client.settings[mealType];
		const body = client.settings.notificationMessages?.[mealType]?.[0] || meal.subtitle;
		let checkin = null;
		try {
			checkin = await getCheckin(checkinsCollection, client.clientId, local.dateKey, mealType);
			if (checkin?.status === "completed" || checkin?.status === "skipped" || checkin?.status === "snoozed") {
				continue;
			}
			if (checkin?.lastReminderAt) continue;
			checkin = checkin || await createOrGetPending(checkinsCollection, {
				clientId: client.clientId,
				localDate: local.dateKey,
				mealType,
				timezone: client.timezone,
				scheduledTime: meal.time,
			}, now);
		} catch (error) {
			logSafe("checkin_gate_failed", { ...getSafeErrorDetails(error), mealType });
		}

		try {
			await sendReminder({
				client,
				mealType,
				localDate: local.dateKey,
				title: `${meal.title}\u65f6\u95f4\u5230\u5566`,
				body,
			});
			lastSent[mealType] = `${local.dateKey}:${local.time}`;
			await collection.doc(client.clientId).update({
				lastSent,
				updatedAt: now.toISOString(),
			});
			if (checkin) {
				try {
					await updateReminderSent(checkinsCollection, checkin, now);
				} catch (error) {
					logSafe("checkin_update_failed", { ...getSafeErrorDetails(error), mealType });
				}
			}
			sent += 1;
		} catch (error) {
			const details = getSafeErrorDetails(error);
			if (details.code === "push_subscription_expired") {
				await collection.doc(client.clientId).remove();
				return { sent: 0, removed: 1, failed: 0 };
			}
			logSafe("scheduled_push_failed", { ...details, mealType });
			return { sent: 0, removed: 0, failed: 1 };
		}
	}

	return { sent, removed: 0, failed: 0 };
};

const processSnoozedMeals = async ({ collection, checkinsCollection, client, now, local, db }) => {
	let sent = 0;

	for (const mealType of mealTypes) {
		let checkin;
		let claimed;
		try {
			checkin = await getCheckin(checkinsCollection, client.clientId, local.dateKey, mealType);
			if (!shouldSendSnooze(checkin, now)) continue;
			if (!isMealAllowedBySettings(client, mealType, local)) {
				logSafe("snooze_blocked_by_settings", { mealType, localDate: local.dateKey });
				continue;
			}
			claimed = await claimSnoozeDispatch(checkinsCollection, checkin, now, db);
			if (!claimed) continue;
		} catch (error) {
			logSafe("snooze_claim_failed", { ...getSafeErrorDetails(error), mealType });
			continue;
		}
		const meal = client.settings[mealType];

		try {
			await sendReminder({
				client,
				mealType,
				localDate: local.dateKey,
				title: `${meal.title}\u65f6\u95f4\u5230\u5566`,
				body: "\u4f60\u8bbe\u7f6e\u7684\u7a0d\u540e\u63d0\u9192\u65f6\u95f4\u5230\u4e86\uff0c\u8bb0\u5f97\u5403\u996d\u5440\uff5e",
			});
			try {
				await finalizeSnoozeDelivered(checkinsCollection, claimed, now, db, claimed.snoozeDispatchToken);
			} catch (error) {
				logSafe("snooze_finalize_failed", { ...getSafeErrorDetails(error), mealType });
			}
			sent += 1;
		} catch (error) {
			const details = getSafeErrorDetails(error);
			if (isAcceptedPushFailure(details.code)) {
				try {
					await releaseSnoozeDispatch(checkinsCollection, claimed, now, db, claimed.snoozeDispatchToken);
				} catch (releaseError) {
					logSafe("snooze_finalize_failed", { ...getSafeErrorDetails(releaseError), mealType });
				}
			}
			if (details.code === "push_subscription_expired") {
				await collection.doc(client.clientId).remove();
				return { sent: 0, removed: 1, failed: 0 };
			}
			logSafe("snoozed_push_failed", { ...details, mealType });
			return { sent: 0, removed: 0, failed: 1 };
		}
	}

	return { sent, removed: 0, failed: 0 };
};

const processClient = async ({ collection, checkinsCollection, client, now = new Date(), db }) => {
	const local = getLocalMinute(now, client.timezone);
	const lastSent = { ...(client.lastSent ?? {}) };
	const normal = await processNormalMeals({ collection, checkinsCollection, client, now, local, lastSent });
	if (normal.removed || normal.failed) return normal;
	const snoozed = await processSnoozedMeals({ collection, checkinsCollection, client, now, local, db });
	if (snoozed.removed || snoozed.failed) return snoozed;

	return { sent: normal.sent + snoozed.sent, removed: 0, failed: 0 };
};

module.exports = {
	getLocalMinute,
	isMealAllowedBySettings,
	processClient,
	shouldSendMeal,
};
