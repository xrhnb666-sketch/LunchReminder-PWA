import { reminderPayload, sendPushPayload } from "./push";
import type { Env, MealType, StoredClient } from "./types";
import { clientKey, mealTypes } from "./types";

export interface LocalMinute {
	dateKey: string;
	time: string;
	weekday: number;
}

export const getLocalMinute = (date: Date, timezone: string): LocalMinute => {
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
	const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	return {
		dateKey: `${map.year}-${map.month}-${map.day}`,
		time: `${map.hour}:${map.minute}`,
		weekday: weekdayMap[map.weekday] ?? 0,
	};
};

export const shouldSendMeal = (client: StoredClient, mealType: MealType, local: LocalMinute) => {
	const settings = client.settings;
	const meal = settings[mealType];
	if (!meal.enabled) return false;
	if (settings.skippedDate === local.dateKey) return false;
	if (settings.weekdaysOnly && (local.weekday === 0 || local.weekday === 6)) return false;
	if (meal.time !== local.time) return false;
	return client.lastSent[mealType] !== `${local.dateKey}:${local.time}`;
};

export const processClient = async (env: Env, client: StoredClient, now = new Date()) => {
	const local = getLocalMinute(now, client.timezone);
	let updated = false;
	for (const mealType of mealTypes) {
		if (!shouldSendMeal(client, mealType, local)) continue;
		const meal = client.settings[mealType];
		const body = client.settings.notificationMessages[mealType]?.[0] || meal.subtitle;
		const result = await sendPushPayload(env, client, reminderPayload(mealType, `${meal.title}时间到啦`, body));
		if (result.invalidSubscription) {
			await env.REMINDERS.delete(clientKey(client.clientId));
			return;
		}
		if (result.ok) {
			client.lastSent[mealType] = `${local.dateKey}:${local.time}`;
			client.updatedAt = now.toISOString();
			updated = true;
		} else {
			console.warn(`push_failed:${mealType}:${result.statusCode ?? "unknown"}`);
		}
	}
	if (updated) {
		await env.REMINDERS.put(clientKey(client.clientId), JSON.stringify(client));
	}
};

export const runSchedule = async (env: Env, now = new Date()) => {
	let cursor: string | undefined;
	do {
		const page = await env.REMINDERS.list({ prefix: "client:", cursor });
		await Promise.all(page.keys.map(async (key) => {
			const client = await env.REMINDERS.get<StoredClient>(key.name, "json");
			if (client) await processClient(env, client, now);
		}));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
};
