class BadRequest extends Error {
	constructor(message) {
		super(message);
		this.name = "BadRequest";
	}
}

class PushDeliveryError extends Error {
	constructor(code, message, statusCode = null) {
		super(message);
		this.name = "PushDeliveryError";
		this.code = code;
		this.statusCode = statusCode;
	}
}

const getSafeErrorDetails = (error) => {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message.slice(0, 500),
			statusCode: error.statusCode ?? error.status ?? null,
			code: error.code,
		};
	}
	return {
		name: "UnknownError",
		message: String(error).slice(0, 500),
		statusCode: null,
	};
};

const statusForPushError = (error) => {
	if (!(error instanceof PushDeliveryError)) return 502;
	if (error.code === "push_subscription_expired") return 410;
	if (error.code === "push_authentication_failed") return 502;
	if (error.code === "push_rate_limited") return 429;
	if (error.code === "vapid_config_missing" || error.code === "invalid_subscription") return 400;
	return 502;
};

module.exports = {
	BadRequest,
	PushDeliveryError,
	getSafeErrorDetails,
	statusForPushError,
};
