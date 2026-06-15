const cloudbase = require("@cloudbase/node-sdk");
const { getSafeErrorDetails } = require("../shared/errors");
const { processClient } = require("../shared/date-utils");

const cloudApp = cloudbase.init({
	env: cloudbase.SYMBOL_CURRENT_ENV,
});
const db = cloudApp.database();
const collection = db.collection("push_clients");

const PAGE_SIZE = 100;

const listClientsPage = async (skip) => {
	const result = await collection.skip(skip).limit(PAGE_SIZE).get();
	return Array.isArray(result.data) ? result.data : [];
};

exports.main = async (event) => {
	const now = new Date();
	let skip = 0;
	let scanned = 0;
	let sent = 0;
	let removed = 0;
	let failed = 0;

	do {
		const clients = await listClientsPage(skip);
		if (clients.length === 0) break;
		for (const client of clients) {
			scanned += 1;
			try {
				if (!client?.clientId || !client?.timezone || !client?.settings || !client?.subscription) {
					failed += 1;
					continue;
				}
				const result = await processClient({ collection, client, now });
				sent += result.sent;
				removed += result.removed;
				failed += result.failed;
			} catch (error) {
				failed += 1;
				console.error("scheduler_client_failed", getSafeErrorDetails(error));
			}
		}
		skip += clients.length;
		if (clients.length < PAGE_SIZE) break;
	} while (true);

	const summary = {
		ok: true,
		scanned,
		sent,
		removed,
		failed,
		triggerType: event?.Type || event?.type || "scheduled",
		checkedAt: now.toISOString(),
	};
	console.log("scheduler_done", summary);
	return summary;
};
