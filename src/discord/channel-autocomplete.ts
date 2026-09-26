/**
 * Searchable guild-channel autocomplete for /admin channels add|remove and
 * /announce channel (ADMIN-2 / DISCORD-ANNOUNCE-2).
 *
 * Discord autocomplete returns at most 25 choices within ~3s. We match
 * guild text channels by case-insensitive name substring (emoji/unicode
 * preserved) and by raw snowflake / <#id> mention, ranking exact → prefix →
 * substring → id, then take the best 25.
 */

/** Discord Application Command option type: STRING */
export const OPT_STRING = 3;

/** Guild text channel type (ChannelType.GuildText). */
export const CHANNEL_TYPE_GUILD_TEXT = 0;

/** Discord autocomplete choice cap. */
export const AUTOCOMPLETE_MAX_CHOICES = 25;

/** Discord choice name/value max length. */
export const AUTOCOMPLETE_CHOICE_MAX = 100;

/** Slack-ish snowflake (Discord ids are ≤19 digits; allow a little headroom). */
export const CHANNEL_SNOWFLAKE_RE = /^\d{1,25}$/;

/** Extract a snowflake from raw typed text (`123`, `<#123>`, surrounding junk). */
export function extractChannelSnowflake(raw: string): string | null {
  const t = raw.trim();
  if (CHANNEL_SNOWFLAKE_RE.test(t)) return t;
  const mention = /^<#(\d{1,25})>$/.exec(t);
  if (mention?.[1]) return mention[1];
  return null;
}

export type ChannelCandidate = {
  id: string;
  /** Display name as Discord shows it (may include emoji/unicode). */
  name: string;
  /** Discord channel type; only GuildText (0) is offered for add/announce. */
  type?: number;
};

export type AutocompleteChoice = { name: string; value: string };

export type MatchRank = "exact" | "prefix" | "substring" | "id";

const RANK_ORDER: Record<MatchRank, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
  id: 3,
};

export type RankedChannel = ChannelCandidate & { rank: MatchRank };

/**
 * Rank how well `query` matches a channel. Empty query → every channel is a
 * weak "substring" hit so empty focus still lists choices.
 */
export function rankChannelMatch(
  channel: ChannelCandidate,
  queryRaw: string,
): MatchRank | null {
  const query = queryRaw.trim();
  const name = channel.name ?? "";
  const nameLower = name.toLowerCase();
  const id = channel.id.trim();

  if (!query) return "substring";

  const snow = extractChannelSnowflake(query);
  if (snow && snow === id) return "exact";

  const q = query.toLowerCase();
  // Strip a leading '#' users often type when searching channel names.
  const qName = q.startsWith("#") ? q.slice(1) : q;

  if (qName && nameLower === qName) return "exact";
  if (qName && nameLower.startsWith(qName)) return "prefix";
  if (qName && nameLower.includes(qName)) return "substring";
  if (snow && id.startsWith(snow)) return "id";
  if (!snow && CHANNEL_SNOWFLAKE_RE.test(query) && id.includes(query)) return "id";
  return null;
}

/**
 * Filter + rank + take best `limit` (default 25). Prefer typed query: when
 * more than `limit` match, exact/prefix beat substring/id.
 */
export function matchChannels(
  channels: readonly ChannelCandidate[],
  query: string,
  opts?: {
    limit?: number;
    /** When set, only these ids are eligible (e.g. allowlisted for remove). */
    idAllowlist?: ReadonlySet<string> | readonly string[];
    /** Restrict to guild text (type 0). Default true. */
    textOnly?: boolean;
  },
): RankedChannel[] {
  const limit = opts?.limit ?? AUTOCOMPLETE_MAX_CHOICES;
  const textOnly = opts?.textOnly !== false;
  const allow =
    opts?.idAllowlist === undefined
      ? null
      : opts.idAllowlist instanceof Set
        ? opts.idAllowlist
        : new Set([...opts.idAllowlist].map((s) => s.trim().toLowerCase()));

  const ranked: RankedChannel[] = [];
  for (const ch of channels) {
    if (textOnly && ch.type !== undefined && ch.type !== CHANNEL_TYPE_GUILD_TEXT) {
      continue;
    }
    if (allow && !allow.has(ch.id.trim().toLowerCase())) continue;
    const rank = rankChannelMatch(ch, query);
    if (!rank) continue;
    ranked.push({ ...ch, rank });
  }

  ranked.sort((a, b) => {
    const rd = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rd !== 0) return rd;
    const nl = a.name.length - b.name.length;
    if (nl !== 0) return nl;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return ranked.slice(0, limit);
}

/** Format Discord autocomplete choices (name ≤100, value = snowflake). */
export function toAutocompleteChoices(
  ranked: readonly RankedChannel[],
): AutocompleteChoice[] {
  return ranked.map((ch) => {
    const label = ch.name ? `#${ch.name}` : `#${ch.id}`;
    const withId = `${label} (${ch.id})`;
    const name =
      withId.length <= AUTOCOMPLETE_CHOICE_MAX
        ? withId
        : label.slice(0, AUTOCOMPLETE_CHOICE_MAX);
    return {
      name,
      value: ch.id.slice(0, AUTOCOMPLETE_CHOICE_MAX),
    };
  });
}

/**
 * Pure autocomplete builder: candidates + query (+ optional allowlist) → ≤25
 * choices. Used by the live gateway and fixture tests.
 */
export function buildChannelAutocompleteChoices(
  channels: readonly ChannelCandidate[],
  query: string,
  opts?: {
    idAllowlist?: ReadonlySet<string> | readonly string[];
    textOnly?: boolean;
    limit?: number;
  },
): AutocompleteChoice[] {
  return toAutocompleteChoices(matchChannels(channels, query, opts));
}

/**
 * Resolve a submitted STRING channel option to a snowflake.
 * Accepts raw id, <#id>, or (when candidates provided) exact name match.
 */
export function resolveChannelOption(
  raw: string,
  candidates?: readonly ChannelCandidate[],
): { ok: true; id: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  const snow = extractChannelSnowflake(trimmed);
  if (snow) return { ok: true, id: snow };
  if (candidates?.length) {
    const q = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    const exact = candidates.filter(
      (c) => c.name.toLowerCase() === q.toLowerCase(),
    );
    if (exact.length === 1) return { ok: true, id: exact[0]!.id };
    if (exact.length > 1) {
      return { ok: false, reason: "ambiguous_name" };
    }
  }
  return { ok: false, reason: "not_snowflake" };
}
