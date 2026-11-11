import { nakamaConfig, nakamaTimeouts } from "./config";
import { NakamaHttpError } from "./types";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export async function nakamaFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    nakamaTimeouts.restMs,
  );

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }

  try {
    const response = await fetch(`${nakamaConfig.httpUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      throw new NakamaHttpError(
        `Nakama ${options.method ?? "GET"} ${path} failed (${response.status})`,
        response.status,
        parsed,
      );
    }

    return parsed as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
