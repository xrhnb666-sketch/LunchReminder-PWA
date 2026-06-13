export type MealType = "breakfast" | "lunch" | "dinner";

export interface Env {
	REMINDERS: KVNamespace;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	VAPID_SUBJECT: string;
	ALLOWED_ORIGIN: string;
}

export interface MealReminder {
	time: string;
	enabled: boolean;
	title: string;
	subtitle: string;
}

export interface ReminderSettings {
	breakfast: MealReminder;
	lunch: MealReminder;
	dinner: MealReminder;
	weekdaysOnly: boolean;
	skippedDate: string | null;
	notificationMessages: Record<MealType, string[]>;
}

export interface PushSubscriptionJSON {
	endpoint: string;
	expirationTime?: number | null;
	keys: {
		p256dh: string;
		auth: string;
	};
}

export interface LastSent {
	breakfast?: string;
	lunch?: string;
	dinner?: string;
}

export interface StoredClient {
	version: 1;
	clientId: string;
	subscription: PushSubscriptionJSON;
	timezone: string;
	settings: ReminderSettings;
	createdAt: string;
	updatedAt: string;
	lastSent: LastSent;
	lastTestSentAt?: string;
}

export interface PushPayload {
	title: string;
	body: string;
	icon: string;
	badge: string;
	tag: string;
	data: {
		url: string;
		mealType?: MealType;
		test?: boolean;
	};
}

export const mealTypes: MealType[] = ["breakfast", "lunch", "dinner"];

export const clientKey = (clientId: string) => `client:${clientId}`;
