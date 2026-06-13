declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {
		readonly __lunchReminderTestEnv?: never;
	}
}
