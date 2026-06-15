const { getSafeErrorDetails } = require("./errors");
const { reminderPayload, sendPushPayload } = require("./push");
const { mealTypes } = require("./validation");

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
	const settings = client.settings;
	const meal = settings[mealType];
	if (!meal.enabled) return false;
	if (settings.skippedDate === local.dateKey) return false;
	if (settings.weekdaysOnly && (local.weekday === 0 || local.weekday === 6)) return false;
	if (meal.time !== local.time) return false;
	return client.lastSent?.[mealType] !== `${local.dateKey}:${local.time}`;
};

const processClient = async ({ collection, client, now = new Date() }) => {
	const local = getLocalMinute(now, client.timezone);
	let updated = false;
	const lastSent = { ...(client.lastSent ?? {}) };

	for (const mealType of mealTypes) {
		if (!shouldSendMeal({ ...client, lastSent }, mealType, local)) continue;
		const meal = client.settings[mealType];
		const body = client.settings.notificationMessages?.[mealType]?.[0] || meal.subtitle;
		try {
			await sendPushPayload(client, reminderPayload(mealType, `${meal.title}时间到啦`, body));
			lastSent[mealType] = `${local.dateKey}:${local.time}`;
			updated = true;
		} catch (error) {
			const details = getSafeErrorDetails(error);
			if (details.code === "push_subscription_expired") {
				await collection.doc(client.clientId).remove();
				return { sent: 0, removed: 1, failed: 0 };
			}
			console.error("scheduled_push_failed", { ...details, mealType });
			return { sent: 0, removed: 0, failed: 1 };
		}
	}

	if (updated) {
		await collection.doc(client.clientId).update({
			lastSent,
			updatedAt: now.toISOString(),
		});
		return { sent: 1, removed: 0, failed: 0 };
	}
	return { sent: 0, removed: 0, failed: 0 };
};

module.exports = {
	getLocalMinute,
	processClient,
	shouldSendMeal,
};
