/**
 * copilotAgentParser.ts — parse local Copilot Agent run log files.
 *
 * Supported format: JSONL where records are typed by a `type` field:
 *   • `agent_turn`  — one user→model interaction (maps to UserMessageSummary)
 *   • `agent_tool`  — a tool call made within the preceding turn
 *   • Unrecognised record types are silently skipped.
 *
 * System-continuation turns (e.g. "[Notification: tests passed]") are merged
 * into the preceding real user message following the same rule used by
 * `parseEntries` for VS Code chat debug logs.
 *
 * Uses `import type` for domain interfaces to avoid circular module deps.
 */

import * as fs from 'fs';
import * as path from 'path';

import type {
    SessionSummary,
    UserMessageSummary,
    ModelTurnSummary,
    ToolCallSummary,
    MergedMessageInfo,
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
// System-continuation detection (mirrors parser.ts isSystemContinuation)
// ---------------------------------------------------------------------------

function isSysContinuation(content: string): boolean {
    return content.startsWith('[Terminal') ||
           content.startsWith('[Notification') ||
           content.startsWith('[Background terminal');
}

// ---------------------------------------------------------------------------
// Internal record shapes after normalisation
// ---------------------------------------------------------------------------

interface AgentTurnRecord {
    kind: 'turn';
    sessionId: string;
    timestamp: number;
    userMessage: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    nanoAiu: number;
    durationMs: number;
}

interface AgentToolRecord {
    kind: 'tool';
    timestamp: number;
    name: string;
    displayLabel: string;
    durationMs: number;
    toolKind?: string;
    resultCount?: number;
}

type AgentRecord = AgentTurnRecord | AgentToolRecord;

// ---------------------------------------------------------------------------
// Per-record normalisation
// ---------------------------------------------------------------------------

function normalizeTurnRecord(raw: Record<string, unknown>, fallbackSessionId: string, index: number): AgentTurnRecord | undefined {
    const userMessage = asStr(firstDef(
        raw.user_message, raw.userMessage, raw.message, raw.prompt, raw.query, raw.content, raw.input
    ), '').replace(/[\r\n]+/g, ' ').trim();
    if (!userMessage) { return undefined; }

    const sessionId = asStr(firstDef(
        raw.session_id, raw.sessionId, raw.sid, raw.run_id, raw.runId
    ), fallbackSessionId);

    const timestamp = toTimestampMs(firstDef(
        raw.ts, raw.timestamp, raw.time, raw.created_at, raw.createdAt
    ), Date.now() + index * 1000);

    const model = asStr(firstDef(
        raw.model, raw.modelId, raw.model_id, raw.engine, raw.llm
    ), 'unknown');

    const inputTokens  = extractTokenCount(raw, 'inputTokens', 'input_tokens', 'prompt_tokens', 'promptTokens');
    const outputTokens = extractTokenCount(raw, 'outputTokens', 'output_tokens', 'completion_tokens', 'completionTokens');
    const cachedTokens = extractTokenCount(raw, 'cachedTokens', 'cached_tokens');
    const nanoAiu      = extractNanoAiu(raw);
    const durationMs   = toFiniteNumber(firstDef(
        raw.durationMs, raw.duration_ms, raw.latency_ms, raw.elapsedMs, raw.elapsed_ms
    )) ?? 0;

    return {
        kind: 'turn',
        sessionId,
        timestamp,
        userMessage: truncate(userMessage, 80),
        model,
        inputTokens,
        outputTokens,
        cachedTokens,
        nanoAiu,
        durationMs: Math.max(0, durationMs),
    };
}

function normalizeToolRecord(raw: Record<string, unknown>, index: number): AgentToolRecord | undefined {
    const name = asStr(firstDef(raw.name, raw.tool_name, raw.toolName, raw.tool, raw.function), '').trim();
    if (!name) { return undefined; }

    const rawArgs = raw.args ?? raw.arguments ?? raw.input ?? {};
    const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
    const displayLabel = asStr(firstDef(raw.displayLabel, raw.label, raw.display_label), name);
    const durationMs   = toFiniteNumber(firstDef(raw.durationMs, raw.duration_ms, raw.elapsed_ms)) ?? 0;
    const toolKind     = asStr(firstDef(raw.toolKind, raw.tool_kind, raw.kind), undefined as any) || undefined;
    const resultCount  = toFiniteNumber(firstDef(raw.resultCount, raw.result_count));

    // Build a friendly display label from common tool names and args
    let friendly = displayLabel;
    try {
        const a = typeof rawArgs === 'object' ? rawArgs as Record<string, unknown> : JSON.parse(argsStr);
        switch (name) {
            case 'run_in_terminal': {
                const cmd = asStr(a?.command, '');
                friendly = cmd ? `Ran: ${truncate(cmd, 55)}` : displayLabel;
                break;
            }
            case 'read_file': {
                const fp = asStr(a?.filePath ?? a?.path, '');
                friendly = fp ? `Read: ${path.basename(fp)}` : displayLabel;
                break;
            }
            case 'grep_search': {
                friendly = `Search: "${truncate(asStr(a?.query), 40)}"`;
                break;
            }
            case 'replace_string_in_file':
            case 'create_file': {
                const fp = asStr(a?.filePath ?? a?.path, '');
                friendly = fp ? `${name === 'create_file' ? 'Create' : 'Edit'}: ${path.basename(fp)}` : displayLabel;
                break;
            }
        }
    } catch { /* ignore parse errors */ }

    return {
        kind: 'tool',
        timestamp: toTimestampMs(firstDef(raw.ts, raw.timestamp), Date.now() + index),
        name,
        displayLabel: friendly,
        durationMs: Math.max(0, durationMs),
        toolKind: toolKind as string | undefined,
        resultCount,
    };
}

function normalizeRecord(raw: unknown, fallbackSessionId: string, index: number): AgentRecord | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;

    const typeStr = asStr(firstDef(r.type, r.kind), '').toLowerCase();
    const isTurnType = typeStr === 'agent_turn' || typeStr === 'turn' || typeStr === 'user_turn';
    const isToolType = typeStr === 'agent_tool' || typeStr === 'tool' || typeStr === 'tool_call';

    if (isTurnType) { return normalizeTurnRecord(r, fallbackSessionId, index); }
    if (isToolType) { return normalizeToolRecord(r, index); }

    // Heuristic: no explicit type — if it has user_message/prompt, treat as turn
    if (firstDef(r.user_message, r.userMessage, r.prompt, r.query)) {
        return normalizeTurnRecord(r, fallbackSessionId, index);
    }
    // If it has a tool name field, treat as tool record
    if (firstDef(r.name, r.tool_name, r.toolName)) {
        return normalizeToolRecord(r, index);
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Summary builders
// ---------------------------------------------------------------------------

interface PendingTurn {
    record: AgentTurnRecord;
    tools: AgentToolRecord[];
}

function buildAgentModelTurn(turn: AgentTurnRecord, tools: AgentToolRecord[]): ModelTurnSummary {
    const toolCallSummaries: ToolCallSummary[] = tools.map((tc, i) => ({
        name: tc.name,
        displayLabel: tc.displayLabel,
        durationMs: tc.durationMs,
        timestamp: tc.timestamp,
        isSubagent: tc.name === 'runSubagent',
        toolKind: tc.toolKind,
        resultCount: tc.resultCount,
    }));

    return {
        model: turn.model,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cachedTokens: turn.cachedTokens,
        totalTokens: turn.inputTokens + turn.outputTokens,
        nanoAiu: turn.nanoAiu,
        durationMs: turn.durationMs,
        ttftMs: 0,
        timestamp: turn.timestamp + 1,
        debugName: 'copilot-agent',
        cacheHitRatio: turn.inputTokens > 0 ? turn.cachedTokens / turn.inputTokens : 0,
        freshTokens: turn.inputTokens - turn.cachedTokens,
        toolCalls: toolCallSummaries,
        inputMessagesChars: turn.userMessage.length,
    };
}

function buildAgentMessageSummary(
    primary: PendingTurn,
    continuations: PendingTurn[],
    index: number
): UserMessageSummary {
    const allPendingTurns = [primary, ...continuations];
    const modelTurns: ModelTurnSummary[] = allPendingTurns.map(p => buildAgentModelTurn(p.record, p.tools));
    const toolCalls: ToolCallSummary[] = modelTurns.flatMap(t => t.toolCalls);
    const mergedMessages: MergedMessageInfo[] = continuations.map((p, i) => ({
        content: truncate(p.record.userMessage, 80),
        timestamp: p.record.timestamp,
        spanId: `agent-continuation-${index}-${i}`,
    }));

    const totalInput   = modelTurns.reduce((s, t) => s + t.inputTokens, 0);
    const totalOutput  = modelTurns.reduce((s, t) => s + t.outputTokens, 0);
    const totalCached  = modelTurns.reduce((s, t) => s + t.cachedTokens, 0);
    const totalTokens  = modelTurns.reduce((s, t) => s + t.totalTokens, 0);
    const totalNanoAiu = modelTurns.reduce((s, t) => s + t.nanoAiu, 0);
    const totalDurMs   = modelTurns.reduce((s, t) => s + t.durationMs, 0);

    return {
        spanId: `agent-msg-${index}`,
        content: primary.record.userMessage,
        timestamp: primary.record.timestamp,
        modelTurns,
        toolCalls,
        mergedMessages,
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalCachedTokens: totalCached,
        totalTokens,
        totalNanoAiu,
        totalDurationMs: totalDurMs,
        contextCharsAtStart: primary.record.userMessage.length,
    };
}

function buildAgentSession(sessionId: string, pendingTurns: PendingTurn[]): SessionSummary | undefined {
    if (pendingTurns.length === 0) { return undefined; }

    // Merge system continuations into the preceding real message
    const groups: { primary: PendingTurn; continuations: PendingTurn[] }[] = [];
    for (const pt of pendingTurns) {
        if (groups.length > 0 && isSysContinuation(pt.record.userMessage)) {
            groups[groups.length - 1].continuations.push(pt);
        } else {
            groups.push({ primary: pt, continuations: [] });
        }
    }

    const userMessages: UserMessageSummary[] = groups.map((g, i) =>
        buildAgentMessageSummary(g.primary, g.continuations, i)
    );

    const summary: SessionSummary = {
        sessionId,
        sourceType: 'copilotAgent',
        userMessages,
        totalInputTokens:  userMessages.reduce((s, m) => s + m.totalInputTokens, 0),
        totalOutputTokens: userMessages.reduce((s, m) => s + m.totalOutputTokens, 0),
        totalCachedTokens: userMessages.reduce((s, m) => s + m.totalCachedTokens, 0),
        totalTokens:       userMessages.reduce((s, m) => s + m.totalTokens, 0),
        totalNanoAiu:      userMessages.reduce((s, m) => s + m.totalNanoAiu, 0),
        totalDurationMs:   userMessages.reduce((s, m) => s + m.totalDurationMs, 0),
        modelTurnCount:    userMessages.reduce((s, m) => s + m.modelTurns.length, 0),
        toolCallCount:     userMessages.reduce((s, m) => s + m.toolCalls.length, 0),
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
 * Parse a local Copilot Agent run log file into a `SessionSummary`.
 *
 * Returns `undefined` when the file cannot be read, is empty, or contains no
 * recognisable turn records.  Never throws.
 */
export function parseCopilotAgentLog(filePath: string): SessionSummary | undefined {
    if (!fs.existsSync(filePath)) { return undefined; }

    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }

    const fallbackSessionId = path.basename(filePath, path.extname(filePath));
    const allRecords: AgentRecord[] = [];

    // Parse JSONL
    const lines = content.split('\n').filter(l => l.trim());
    for (let i = 0; i < lines.length; i++) {
        let raw: unknown;
        try { raw = JSON.parse(lines[i]); } catch { continue; }
        if (Array.isArray(raw)) { continue; }
        const record = normalizeRecord(raw, fallbackSessionId, i);
        if (record) { allRecords.push(record); }
    }

    // Fallback: JSON array
    if (allRecords.length === 0) {
        try {
            const json = JSON.parse(content);
            const arr: unknown[] = Array.isArray(json)
                ? json
                : (json.events ?? json.turns ?? json.steps ?? json.records ?? []);
            for (let i = 0; i < arr.length; i++) {
                const record = normalizeRecord(arr[i], fallbackSessionId, i);
                if (record) { allRecords.push(record); }
            }
        } catch { /* not valid JSON */ }
    }

    if (allRecords.length === 0) { return undefined; }

    // Determine canonical session ID from first turn record
    const firstTurn = allRecords.find((r): r is AgentTurnRecord => r.kind === 'turn');
    const sessionId = firstTurn?.sessionId ?? fallbackSessionId;

    // Build pending-turn groups: each turn record starts a new group; tool
    // records accumulate in the most recent group.
    const pendingTurns: PendingTurn[] = [];
    for (const record of allRecords) {
        if (record.kind === 'turn') {
            pendingTurns.push({ record: { ...record, sessionId }, tools: [] });
        } else if (record.kind === 'tool' && pendingTurns.length > 0) {
            pendingTurns[pendingTurns.length - 1].tools.push(record);
        }
        // Orphan tool records (before any turn) are discarded
    }

    return buildAgentSession(sessionId, pendingTurns);
}
