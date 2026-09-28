/**
 * `bun --preload` fixture for CLI subprocess tests: every request to Discord
 * or GitHub answers 401 the way a bad token does (Discord `401: Unauthorized`,
 * GitHub `Bad credentials`). The login, register-commands and watch failure
 * paths then run with no network and no real token. Other URLs pass through.
 *
 * It must be preloaded: @discordjs/rest picks `fetch` when it loads.
 */
const realFetch = globalThis.fetch;

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
}

const fake = (async (input: unknown, init?: unknown) => {
  const url = urlOf(input);
  let body: unknown;
  if (/^https:\/\/api\.github\.com\//.test(url)) {
    body = {
      message: "Bad credentials",
      documentation_url: "https://docs.github.com/rest",
      status: "401",
    };
  } else if (/^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//.test(url)) {
    body = { message: "401: Unauthorized", code: 0 };
  } else {
    return realFetch(input as Request, init as RequestInit);
  }
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

globalThis.fetch = fake;
