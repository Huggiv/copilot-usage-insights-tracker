/**
 * normalizers.ts — shared primitive coercion helpers reused by all source-specific parsers.
 *
 * Intentionally has NO imports from other project modules to prevent circular dependencies.
 * Parser sub-modules (copilotCliParser, copilotAgentParser) use `import type` for domain
 * interfaces so these helpers remain leaf-level.
 */

/** Matches nano-AIU scaling: 1 AIC = 1,000,000,000 nano-AIU */
export const NANO_AIU_PER_AIC_LOCAL = 1_000_000_000;

// ---------------------------------------------------------------------------
// Numeric / timestamp coercion
// ---------------------------------------------------------------------------

/** Returns a finite number or undefined. Never returns NaN or ±Infinity. */
export function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

/**
 * Coerce an unknown value to a millisecond epoch timestamp.
 * Handles:
 *   - Numeric milliseconds (> 10^10)
 *   - Numeric seconds (< 10^10) → converted to ms
 *   - ISO 8601 strings
 *   - Falls back to `fallback` (default: Date.now()).
 */
export function toTimestampMs(value: unknown, fallback = Date.now()): number {
    const n = toFiniteNumber(value);
    if (n !== undefined) {
        // Heuristic: values under 10^10 are seconds (Unix epoch in seconds ends ~2286 at 10^10)
        return n > 0 && n < 10_000_000_000 ? n * 1000 : n;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) { return parsed; }
    }
    return fallback;
}

/** Safe string coercion. Returns `fallback` for null/undefined. */
export function asStr(value: unknown, fallback = ''): string {
    if (value === undefined || value === null) { return fallback; }
    return String(value);
}

/** Returns the first argument that is not undefined or null. */
export function firstDef<T>(...values: (T | undefined | null)[]): T | undefined {
    return values.find(v => v !== undefined && v !== null) as T | undefined;
}

// ---------------------------------------------------------------------------
// Credit / billing helpers
// ---------------------------------------------------------------------------

/** Convert AI Credits (AIC) to nano-AIU. */
export function aicToNanoAiu(aic: number): number {
    return Math.round(aic * NANO_AIU_PER_AIC_LOCAL);
}

/** Convert USD to nano-AIU.  1 USD = 100 AIC, 1 AIC = NANO_AIU_PER_AIC_LOCAL. */
export function usdToNanoAiu(usd: number): number {
    return Math.round(usd * 100 * NANO_AIU_PER_AIC_LOCAL);
}

/**
 * Extract nano-AIU from a log record trying multiple field name aliases.
 * Returns 0 if no recognised field is found or all values are ≤ 0.
 */
export function extractNanoAiu(record: Record<string, unknown>): number {
    // Direct nano-AIU fields
    const directNano = firstDef(
        record.nanoAiu,
        record.copilotUsageNanoAiu,
        record.nano_aiu,
        record.nanoAIU
    );
    const directN = toFiniteNumber(directNano);
    if (directN !== undefined && directN > 0) { return Math.round(directN); }

    // AIC fields
    const aicVal = firstDef(record.aic, record.credits, record.aiCredits, record.ai_credits);
    const aic = toFiniteNumber(aicVal);
    if (aic !== undefined && aic > 0) { return aicToNanoAiu(aic); }

    // USD / cost fields
    const usdVal = firstDef(record.cost, record.costUsd, record.cost_usd, record.usd, record.pricingCost);
    const usd = toFiniteNumber(usdVal);
    if (usd !== undefined && usd > 0) { return usdToNanoAiu(usd); }

    return 0;
}

/**
 * Extract an integer token count from a record using the provided field name aliases.
 * Returns 0 if no recognised alias yields a finite number.
 */
export function extractTokenCount(record: Record<string, unknown>, ...fieldAliases: string[]): number {
    for (const field of fieldAliases) {
        const n = toFiniteNumber(record[field]);
        if (n !== undefined && n >= 0) { return Math.round(n); }
    }
    return 0;
}

/** Truncate a string to `maxLen` characters, appending '…' when truncated. */
export function truncate(s: string, maxLen: number): string {
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}
