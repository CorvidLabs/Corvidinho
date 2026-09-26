/**
 * Canonical Corvidinho attribution for outbound artifacts.
 *
 * Keep both forms centralized so callers do not introduce handles or variant
 * footers when formatting PR bodies and other public output.
 */
export const CORVIDINHO_URL = "https://github.com/CorvidLabs/Corvidinho";

export const ATTRIBUTION_MARKDOWN = `Made with [Corvidinho](${CORVIDINHO_URL})`;

export const ATTRIBUTION_PLAIN = `Made with Corvidinho — ${CORVIDINHO_URL}`;

export type AttributionFormat = "markdown" | "plain";

export function attribution(format: AttributionFormat = "markdown"): string {
  return format === "plain" ? ATTRIBUTION_PLAIN : ATTRIBUTION_MARKDOWN;
}
