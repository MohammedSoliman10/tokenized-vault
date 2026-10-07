/**
 * format — presentation helpers (no React, no side effects).
 */

/**
 * Truncate a hex address for display: `0x1234…abcd`.
 * Non-address strings (ENS names, short values) are returned unchanged.
 */
export function truncateAddress(address: string, lead = 4, tail = 4): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return address
  return `${address.slice(0, 2 + lead)}…${address.slice(-tail)}`
}

/**
 * Display an 18-decimal token amount with up to `maxFractionDigits` fraction digits,
 * trailing fraction zeros trimmed (pure bigint math — no float drift).
 *
 * `1000000000000000000n` → `"1"`, `1500000000000000000n` → `"1.5"`,
 * `999n` → `"0"` (dust below the display precision).
 */
export function formatTokenAmount(value: bigint, decimals = 18, maxFractionDigits = 4): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const base = 10n ** BigInt(decimals)

  const whole = abs / base
  const fraction = abs % base
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, Math.max(0, Math.min(maxFractionDigits, decimals)))
    .replace(/0+$/, '')

  const text = fractionStr ? `${whole}.${fractionStr}` : whole.toString()
  return negative ? `-${text}` : text
}

const UNITS: ReadonlyArray<readonly [ms: number, name: string]> = [
  [86_400_000, 'day'],
  [3_600_000, 'hour'],
  [60_000, 'minute'],
  [1_000, 'second'],
]

/**
 * Human relative time for a unix timestamp in SECONDS.
 *
 * Future: bare duration (`"23 hours"`, `"less than a minute"`) — the caller supplies
 * words like "in" (e.g. `CooldownActive`: "next claim in {relative time}").
 * Past: duration with " ago" (`"2 hours ago"`) for history columns.
 */
export function formatRelativeTime(timestampSeconds: number | bigint, nowMs = Date.now()): string {
  const deltaMs = Number(timestampSeconds) * 1000 - nowMs
  const abs = Math.abs(deltaMs)

  if (abs < 60_000) {
    return deltaMs < 0 ? 'less than a minute ago' : 'less than a minute'
  }
  for (const [ms, name] of UNITS) {
    if (abs >= ms) {
      const value = Math.floor(abs / ms)
      const text = `${value} ${name}${value === 1 ? '' : 's'}`
      return deltaMs < 0 ? `${text} ago` : text
    }
  }
  /* c8 ignore next */
  return deltaMs < 0 ? 'less than a minute ago' : 'less than a minute'
}
