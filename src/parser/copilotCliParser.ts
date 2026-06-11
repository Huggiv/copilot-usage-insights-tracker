/**
 * copilotCliParser.ts — parse local Copilot CLI usage log files.
 *
 * Supported formats:
 *   • JSONL: one record per line, each line is a CLI query/response interaction.
 *   • JSON array: top-level array (or object with a recognised array field).
 *
 * The parser is intentionally tolerant: malformed lines are silently skipped
 * and only records that contain at minimum a prompt/query field are retained.
 *
 * Uses `import type` for domain interfaces to avoid a circular module dependency
 * with the parent parser.ts module.
 */

import * as fs from 'fs';
import * as path from 'path';

import type {
    SessionSummary,
    UserMessageSummary,
    ModelTurnSummary,
} from '../parser';

import {
    toFiniteNumber,
    toTimestampMs,
    asStr,
    firstDef,
    extractNanoAiu,
    extractTokenCount,
    truncate,
} from './normalizers';

// ---------------------------------------------------------------------------
// Internal record shape after normalisation
// ---------------------------------------------------------------------------

interface CliRecord {
    sessionId: string;
    timestamp: number;
    model: string;
    prompt: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    nanoAiu: number;
    durationMs: number;
}

// ---------------------------------------------------------------------------
// Per-record normalisation
// ---------------------------------------------------------------------------

function normalizeCliRecord(raw: unknown, fallbackSessionId: string, index: number): CliRecord | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;

    // Require at least a non-empty prompt / query
    const prompt = asStr(firstDef(
        r.prompt, r.query, r.message, r.question, r.input, r.content, r.text,
        r.user_message, r.userMessage, r.user
    ), '').replace(/[\r\n]+/g, ' ').trim();
    if (!prompt) { return undefined; }

    const sessionId = asStr(firstDef(
        r.session_id, r.sessionId, r.sid, r.conversationId, r.conversation_id
    ), fallbackSessionId);

    const timestamp = toTimestampMs(firstDef(
        r.ts, r.timestamp, r.time, r.created_at, r.createdAt, r.date
    ), Date.now() + index * 1000);

    const model = asStr(firstDef(
        r.model, r.modelId, r.model_id, r.engine, r.llm, r.model_name
    ), 'unknown');

    const inputTokens  = extractTokenCount(r, 'inputTokens', 'input_tokens', 'prompt_tokens', 'promptTokens', 'tokens_used', 'tokensUsed');
    const outputTokens = extractTokenCount(r, 'outputTokens', 'output_tokens', 'completion_tokens', 'completionTokens', 'response_tokens');
    const cachedTokens = extractTokenCount(r, 'cachedTokens', 'cached_tokens', 'cache_tokens', 'cacheTokens');
    const nanoAiu      = extractNanoAiu(r);
    const durationMs   = toFiniteNumber(firstDef(
        r.durationMs, r.duration_ms, r.latency_ms, r.latencyMs, r.elapsed_ms, r.elapsedMs, r.duration
    )) ?? 0;

    return {
        sessionId,
        timestamp,
        model,
        prompt: truncate(prompt, 80),
        inputTokens,
        outputTokens,
        cachedTokens,
        nanoAiu,
        durationMs: Math.max(0, durationMs),
    };
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

function buildCliModelTurn(record: CliRecord): ModelTurnSummary {
    return {
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cachedTokens: record.cachedTokens,
        totalTokens: record.inputTokens + record.outputTokens,
        nanoAiu: record.nanoAiu,
        durationMs: record.durationMs,
        ttftMs: 0,
        timestamp: record.timestamp + 1,
        debugName: 'copilot-cli',
        cacheHitRatio: record.inputTokens > 0 ? record.cachedTokens / record.inputTokens : 0,
        freshTokens: record.inputTokens - record.cachedTokens,
        toolCalls: [],
        inputMessagesChars: record.prompt.length,
    };
}

function buildCliMessageSummary(record: CliRecord, index: number): UserMessageSummary {
    const turn = buildCliModelTurn(record);
    return {
        spanId: `cli-msg-${index}`,
        content: record.prompt,
        timestamp: record.timestamp,
        modelTurns: [turn],
        toolCalls: [],
        mergedMessages: [],
        totalInputTokens: record.inputTokens,
        totalOutputTokens: record.outputTokens,
        totalCachedTokens: record.cachedTokens,
        totalTokens: record.inputTokens + record.outputTokens,
        totalNanoAiu: record.nanoAiu,
        totalDurationMs: record.durationMs,
        contextCharsAtStart: record.prompt.length,
    };
}

function aggregateCliSummary(sessionId: string, records: CliRecord[]): SessionSummary {
    const userMessages: UserMessageSummary[] = records.map((r, i) => buildCliMessageSummary(r, i));

    const summary: SessionSummary = {
        sessionId,
        sourceType: 'copilotCli',
        userMessages,
        totalInputTokens:  userMessages.reduce((s, m) => s + m.totalInputTokens, 0),
        totalOutputTokens: userMessages.reduce((s, m) => s + m.totalOutputTokens, 0),
        totalCachedTokens: userMessages.reduce((s, m) => s + m.totalCachedTokens, 0),
        totalTokens:       userMessages.reduce((s, m) => s + m.totalTokens, 0),
        totalNanoAiu:      userMessages.reduce((s, m) => s + m.totalNanoAiu, 0),
        totalDurationMs:   userMessages.reduce((s, m) => s + m.totalDurationMs, 0),
        modelTurnCount:    userMessages.length,
        toolCallCount:     0,
    };

    if (userMessages.length > 0) {
        summary.title = truncate(userMessages[0].content, 60);
    }

    return summary;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parse a Copilot CLI usage log file into a `SessionSummary`.
 *
 * Returns `undefined` when the file cannot be read, is empty, or contains no
 * records with a recognisable prompt field.  Never throws.
 */
export function parseCopilotCliLog(filePath: string): SessionSummary | undefined {
    if (!fs.existsSync(filePath)) { return undefined; }

    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const fallbackSessionId = path.basename(filePath, path.extname(filePath));
    const records: CliRecord[] = [];
    let sessionId = fallbackSessionId;

    // --- Try JSONL (one JSON value per line) ---
    const lines = content.split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
        let raw: unknown;
        try { raw = JSON.parse(lines[i]); } catch { continue; }

        // Skip bare arrays at line level (may be a JSON-array file opened as JSONL)
        if (Array.isArray(raw)) { continue; }

        const record = normalizeCliRecord(raw, fallbackSessionId, i);
        if (!record) { continue; }
        if (records.length === 0) { sessionId = record.sessionId; }
        records.push({ ...record, sessionId });
    }

    // --- Fallback: try top-level JSON array / object ---
    if (records.length === 0) {
        try {
            const json = JSON.parse(content);
            const arr: unknown[] = Array.isArray(json)
                ? json
                : (json.interactions ?? json.queries ?? json.history ?? json.events ?? []);
            for (let i = 0; i < arr.length; i++) {
                const record = normalizeCliRecord(arr[i], fallbackSessionId, i);
                if (!record) { continue; }
                if (records.length === 0) { sessionId = record.sessionId; }
                records.push({ ...record, sessionId });
            }
        } catch { /* not valid JSON */ }
    }

    if (records.length === 0) { return undefined; }

    return aggregateCliSummary(sessionId, records);
}
