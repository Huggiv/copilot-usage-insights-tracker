/**
 * reportSessionToServer — fire-and-forget sender for copilot usage data.
 *
 * Reads `copilotUsageTracker.serverUrl` and `copilotUsageTracker.userId` from
 * VS Code settings. Does nothing (and never throws) when serverUrl is empty or
 * the server is unreachable.
 */

import * as http from 'http';
import * as https from 'https';
import * as os from 'os';

import * as vscode from 'vscode';
import { SessionSummary } from './parser';

interface SessionPayload {
    session_id: string;
    user_id: string;
    title: string | null;
    started_at: string | null;
    ended_at: string | null;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_tokens: number;
    total_nano_aiu: number;
    total_duration_ms: number;
    model_turn_count: number;
    tool_call_count: number;
    raw_payload: {
        source: string;
        source_type: string | null;
        /** Reports originating source category: 'vscode' | 'copilot_cli' | 'copilot_agent' */
        source_category: string;
        message_count: number;
    };
}

interface ModelUsagePayload {
    session_id: string;
    date: string;
    user_id: string;
    model: string;
    nano_aiu: number;
    input_tokens: number;
    output_tokens: number;
    session_count: number;
    request_count: number;
}

function getServerUrl(): string {
    return vscode.workspace
        .getConfiguration('copilotUsageTracker')
        .get<string>('serverUrl', '')
        .trim();
}

export function isServerReportingEnabled(): boolean {
    return getServerUrl().length > 0;
}

async function getUserId(): Promise<string> {
    const configured = vscode.workspace
        .getConfiguration('copilotUsageTracker')
        .get<string>('userId', '')
        .trim();
    if (configured) {
        return configured;
    }
    // Try the VS Code GitHub authentication session (silent — no prompt).
    try {
        const session = await vscode.authentication.getSession(
            'github',
            ['read:user'],
            { silent: true },
        );
        if (session?.account?.label) {
            return session.account.label;
        }
    } catch {
        // GitHub auth not available or user not signed in with GitHub.
    }
    // Fall back to OS username.
    try {
        return os.userInfo().username || 'unknown';
    } catch {
        return 'unknown';
    }
}

function postJson(baseUrl: string, urlPath: string, body: object): Promise<boolean> {
    return new Promise((resolve) => {
        let url: URL;
        try {
            url = new URL(urlPath, baseUrl);
        } catch {
            resolve(false);
            return;
        }

        const bodyStr = JSON.stringify(body);
        const isHttps = url.protocol === 'https:';
        const defaultPort = isHttps ? 443 : 80;
        const opts: http.RequestOptions = {
            hostname: url.hostname,
            port: url.port ? Number(url.port) : defaultPort,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
            },
        };

        const transport = isHttps ? https : http;
        const req = transport.request(opts, (res) => {
            res.resume(); // drain and discard response body
            resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
        req.write(bodyStr);
        req.end();
    });
}

function sourceTypeToCategory(sourceType: string | undefined): string {
    if (sourceType === 'copilotCli')   { return 'copilot_cli'; }
    if (sourceType === 'copilotAgent') { return 'copilot_agent'; }
    return 'vscode';
}

function buildSessionPayload(summary: SessionSummary, userId: string): SessionPayload {
    const firstMsg = summary.userMessages[0];
    const lastMsg = summary.userMessages[summary.userMessages.length - 1];

    // Determine session end: end of last model turn (ts + dur), fallback to last
    // user-message timestamp so the value is always an honest upper bound.
    const lastTurns = lastMsg?.modelTurns;
    const lastTurn = lastTurns && lastTurns.length > 0 ? lastTurns[lastTurns.length - 1] : undefined;
    const endedAt = lastTurn
        ? new Date(lastTurn.timestamp + lastTurn.durationMs).toISOString()
        : (lastMsg ? new Date(lastMsg.timestamp).toISOString() : null);

    return {
        session_id: summary.sessionId,
        user_id: userId,
        title: summary.title ?? null,
        started_at: firstMsg ? new Date(firstMsg.timestamp).toISOString() : null,
        ended_at: endedAt,
        total_input_tokens: summary.totalInputTokens,
        total_output_tokens: summary.totalOutputTokens,
        total_cached_tokens: summary.totalCachedTokens,
        total_tokens: summary.totalTokens,
        total_nano_aiu: summary.totalNanoAiu,
        total_duration_ms: summary.totalDurationMs,
        model_turn_count: summary.modelTurnCount,
        tool_call_count: summary.toolCallCount,
        raw_payload: {
            source: 'copilot_usage_extension',
            source_type: summary.sourceType ?? null,
            source_category: sourceTypeToCategory(summary.sourceType),
            message_count: summary.userMessages.length,
        },
    };
}

function buildModelUsagePayloads(summary: SessionSummary, userId: string): ModelUsagePayload[] {
    const buckets = new Map<string, ModelUsagePayload>();

    for (const message of summary.userMessages) {
        for (const turn of message.modelTurns) {
            const date = new Date(turn.timestamp).toISOString().slice(0, 10);
            const model = (turn.model || 'unknown').trim() || 'unknown';
            const key = `${date}|${userId}|${model}`;

            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {
                    session_id: summary.sessionId,
                    date,
                    user_id: userId,
                    model,
                    nano_aiu: 0,
                    input_tokens: 0,
                    output_tokens: 0,
                    session_count: 1,
                    request_count: 0,
                };
                buckets.set(key, bucket);
            }

            bucket.nano_aiu += turn.nanoAiu || 0;
            bucket.input_tokens += turn.inputTokens || 0;
            bucket.output_tokens += turn.outputTokens || 0;
            bucket.request_count += 1;
        }
    }

    return [...buckets.values()];
}

async function postModelUsageRows(baseUrl: string, rows: ModelUsagePayload[]): Promise<boolean> {
    if (rows.length === 0) {
        return true;
    }

    return postJson(baseUrl, '/api/v1/model-usage/batch', rows).catch(() => false);
}

export async function reportSessionsBatchToServer(summaries: SessionSummary[]): Promise<boolean> {
    const serverUrl = getServerUrl();
    if (!serverUrl || summaries.length === 0) {
        return false;
    }

    const userId = await getUserId();
    const sessionPayloads = summaries.map((summary) => buildSessionPayload(summary, userId));
    const modelUsageRows = summaries.flatMap((summary) => buildModelUsagePayloads(summary, userId));

    const sessionsOk = await postJson(serverUrl, '/api/v1/sessions/batch', sessionPayloads).catch(() => false);
    const modelRowsOk = await postModelUsageRows(serverUrl, modelUsageRows);
    return sessionsOk && modelRowsOk;
}

/**
 * Sends session summary to the configured server in the background.
 * Safe to call on every session load — does nothing if serverUrl is not set.
 * Returns a Promise; callers can fire-and-forget (no await needed).
 */
export async function reportSessionToServer(summary: SessionSummary): Promise<void> {
    const serverUrl = getServerUrl();
    if (!serverUrl) {
        return;
    }
    const userId = await getUserId();
    const payload = buildSessionPayload(summary, userId);
    await postJson(serverUrl, '/api/v1/sessions', payload).catch(() => false);

    const modelUsageRows = buildModelUsagePayloads(summary, userId);
    await postModelUsageRows(serverUrl, modelUsageRows);
}
