export interface SafeErrorDetails {
	name: string;
	message: string;
	statusCode: number | null;
	code?: string;
}

export const getSafeErrorDetails = (error: unknown): SafeErrorDetails => {
	if (error instanceof Error) {
		const candidate = error as Error & {
			statusCode?: number;
			status?: number;
			code?: string;
		};
		return {
			name: error.name,
			message: error.message.slice(0, 500),
			statusCode: candidate.statusCode ?? candidate.status ?? null,
			code: candidate.code,
		};
	}

	return {
		name: "UnknownError",
		message: String(error).slice(0, 500),
		statusCode: null,
	};
};
