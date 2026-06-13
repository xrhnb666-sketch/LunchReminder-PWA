import type { MealReminder, PushSubscriptionJSON, ReminderSettings } from "./types";
import { mealTypes } from "./types";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BadRequest extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BadRequest";
	}
}

export const isValidClientId = (clientId: string) => uuidPattern.test(clientId);

export const assertClientId = (clientId: string) => {
	if (!isValidClientId(clientId)) throw new BadRequest("invalid_client_id");
};

export const assertTimezone = (timezone: unknown): string => {
	if (typeof timezone !== "string" || timezone.length > 80) throw new BadRequest("invalid_timezone");
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
		return timezone;
	} catch {
		throw new BadRequest("invalid_timezone");
	}
};

const shortText = (value: unknown, fallback: string) => {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 80) return fallback;
	return trimmed;
};

const mealReminder = (value: unknown, fallback: MealReminder): MealReminder => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_meal");
	const input = value as Partial<MealReminder>;
	if (typeof input.enabled !== "boolean") throw new BadRequest("invalid_meal_enabled");
	if (typeof input.time !== "string" || !timePattern.test(input.time)) throw new BadRequest("invalid_meal_time");
	return {
		time: input.time,
		enabled: input.enabled,
		title: shortText(input.title, fallback.title),
		subtitle: shortText(input.subtitle, fallback.subtitle),
	};
};

export const validateSettings = (value: unknown): ReminderSettings => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_settings");
	const input = value as Partial<ReminderSettings>;
	const defaults: ReminderSettings = {
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

	const messages = defaults.notificationMessages;
	for (const mealType of mealTypes) {
		const values = input.notificationMessages?.[mealType];
		if (Array.isArray(values)) {
			messages[mealType] = values
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0 && item.length <= 120)
				.slice(0, 10);
			if (messages[mealType].length === 0) messages[mealType] = defaults.notificationMessages[mealType];
		}
	}

	return {
		breakfast: mealReminder(input.breakfast, defaults.breakfast),
		lunch: mealReminder(input.lunch, defaults.lunch),
		dinner: mealReminder(input.dinner, defaults.dinner),
		weekdaysOnly: typeof input.weekdaysOnly === "boolean" ? input.weekdaysOnly : false,
		skippedDate: input.skippedDate === null || input.skippedDate === undefined
			? null
			: typeof input.skippedDate === "string" && datePattern.test(input.skippedDate)
				? input.skippedDate
				: (() => {
					throw new BadRequest("invalid_skipped_date");
				})(),
		notificationMessages: messages,
	};
};

export const validateSubscription = (value: unknown): PushSubscriptionJSON => {
	if (!value || typeof value !== "object") throw new BadRequest("invalid_subscription");
	const input = value as Partial<PushSubscriptionJSON>;
	if (typeof input.endpoint !== "string" || !input.endpoint.startsWith("https://") || input.endpoint.length > 2048) {
		throw new BadRequest("invalid_endpoint");
	}
	if (!input.keys || typeof input.keys.p256dh !== "string" || typeof input.keys.auth !== "string") {
		throw new BadRequest("invalid_keys");
	}
	return {
		endpoint: input.endpoint,
		expirationTime: input.expirationTime ?? null,
		keys: {
			p256dh: input.keys.p256dh,
			auth: input.keys.auth,
		},
	};
};

export const validateContentEncodings = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0 && item.length <= 40)
		.slice(0, 5);
};

export const readJson = async (request: Request, maxBytes = 32_768) => {
	const contentType = request.headers.get("Content-Type") ?? "";
	if (!contentType.toLowerCase().includes("application/json")) throw new BadRequest("content_type_required");
	const text = await request.text();
	if (text.length > maxBytes) throw new BadRequest("body_too_large");
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new BadRequest("invalid_json");
	}
};
