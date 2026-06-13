import type { Env } from "./types";

const devOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

export const getAllowedOrigin = (request: Request, env: Env) => {
	const origin = request.headers.get("Origin");
	if (!origin) return null;
	if (origin === env.ALLOWED_ORIGIN || devOrigins.has(origin)) return origin;
	return null;
};

export const corsHeaders = (origin: string) => ({
	"Access-Control-Allow-Origin": origin,
	"Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
	Vary: "Origin",
});

export const withCors = (request: Request, env: Env, response: Response) => {
	const origin = getAllowedOrigin(request, env);
	if (!origin) return response;
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const handleOptions = (request: Request, env: Env) => {
	const origin = getAllowedOrigin(request, env);
	if (!origin) return json({ error: "origin_not_allowed" }, 403);
	return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...headers,
		},
	});
