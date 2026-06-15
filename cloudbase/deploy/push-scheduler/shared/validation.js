const { BadRequest } = require("./errors");

const mealTypes = ["breakfast", "lunch", "dinner"];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const assertClientId = (clientId) => {
	if (!uuidPattern.test(clientId)) throw new BadRequest("invalid_client_id");
	return clientId;
};

const assertTimezone = (timezone) => {
	if (typeof timezone !== "string" || timezone.length > 80) throw new BadRequest("invalid_timezone");
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
		return timezone;
	} catch {
		throw new BadRequest("invalid_timezone");
	}
};

const shortText = (value, fallback) => {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 80) return fallback;
	return trimmed;
};

const mealReminder = (value, fallback) => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_meal");
	if (typeof value.enabled !== "boolean") throw new BadRequest("invalid_meal_enabled");
	if (typeof value.time !== "string" || !timePattern.test(value.time)) throw new BadRequest("invalid_meal_time");
	return {
		time: value.time,
		enabled: value.enabled,
		title: shortText(value.title, fallback.title),
		subtitle: shortText(value.subtitle, fallback.subtitle),
	};
};

const defaultSettings = {
	breakfast: { time: "08:00", enabled: false, title: "早餐", subtitle: "清晨能量" },
	lunch: { time: "12:00", enabled: true, title: "午餐", subtitle: "先吃饭呀" },
	dinner: { time: "18:00", enabled: false, title: "晚餐", subtitle: "好好收尾" },
	weekdaysOnly: false,
	skippedDate: null,
	notificationMessages: {
		breakfast: ["早餐时间到了"],
		lunch: ["午饭时间到了"],
		dinner: ["晚饭时间到了"],
	},
};

const validateSettings = (value) => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_settings");
	const messages = {
		breakfast: [...defaultSettings.notificationMessages.breakfast],
		lunch: [...defaultSettings.notificationMessages.lunch],
		dinner: [...defaultSettings.notificationMessages.dinner],
	};

	for (const mealType of mealTypes) {
		const values = value.notificationMessages?.[mealType];
		if (Array.isArray(values)) {
			messages[mealType] = values
				.filter((item) => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0 && item.length <= 120)
				.slice(0, 10);
			if (messages[mealType].length === 0) {
				messages[mealType] = [...defaultSettings.notificationMessages[mealType]];
			}
		}
	}

	return {
		breakfast: mealReminder(value.breakfast, defaultSettings.breakfast),
		lunch: mealReminder(value.lunch, defaultSettings.lunch),
		dinner: mealReminder(value.dinner, defaultSettings.dinner),
		weekdaysOnly: typeof value.weekdaysOnly === "boolean" ? value.weekdaysOnly : false,
		skippedDate: value.skippedDate === null || value.skippedDate === undefined
			? null
			: typeof value.skippedDate === "string" && datePattern.test(value.skippedDate)
				? value.skippedDate
				: (() => {
					throw new BadRequest("invalid_skipped_date");
				})(),
		notificationMessages: messages,
	};
};

const validateSubscription = (value) => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_subscription");
	if (typeof value.endpoint !== "string" || !value.endpoint.startsWith("https://") || value.endpoint.length > 2048) {
		throw new BadRequest("invalid_endpoint");
	}
	if (!value.keys || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string") {
		throw new BadRequest("invalid_keys");
	}
	return {
		endpoint: value.endpoint,
		expirationTime: value.expirationTime ?? null,
		keys: {
			p256dh: value.keys.p256dh,
			auth: value.keys.auth,
		},
	};
};

const validateContentEncodings = (value) => {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item) => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0 && item.length <= 40)
		.slice(0, 5);
};

module.exports = {
	mealTypes,
	assertClientId,
	assertTimezone,
	validateContentEncodings,
	validateSettings,
	validateSubscription,
};
