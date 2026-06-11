/**
 * githubBilling — best-effort fetch of the signed-in user's current-month
 * GitHub Copilot usage via the Enhanced Billing Platform usage API.
 *
 * This is intentionally fail-soft: when the user is not signed in with GitHub,
 * the token lacks billing permission, or the network is unreachable, every
 * function resolves to `undefined` so callers can fall back to local logs.
 */

import * as https from 'https';

import * as vscode from 'vscode';
import { NANO_AIU_PER_AIC } from './parser';

// GitHub bills Copilot premium usage in USD. This extension's primary unit is
// the AI Credit (AIC), where 1 AIC = $0.01 USD (see formatUsdEstimate). So
// 1 USD == 100 AIC, and nano-AIU = USD * 100 * NANO_AIU_PER_AIC.
const AIC_PER_USD = 100;

interface BillingUsageItem {
    product?: string;
    netAmount?: number;
    grossAmount?: number;
}

interface BillingUsageResponse {
    usageItems?: BillingUsageItem[];
}

export interface GitHubCreditUsage {
    /** Current calendar-month Copilot usage expressed in nano-AIU. */
    nanoAiu: number;
    /** GitHub login the figure was fetched for. */
    login: string;
}

/**
 * Obtain a GitHub token from VS Code's authentication provider without
 * prompting the user. Returns undefined when the user is not signed in.
 */
async function getSilentGitHubSession(): Promise<vscode.AuthenticationSession | undefined> {
    try {
        return await vscode.authentication.getSession('github', ['read:user'], { silent: true });
    } catch {
        return undefined;
    }
}

function httpGetJson(url: string, token: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch (err) {
            reject(err);
            return;
        }

        const req = https.request(
            {
                method: 'GET',
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'copilot-usage-insights-tracker',
                },
                timeout: 8000,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf-8'),
                    });
                });
            },
        );

        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.on('error', reject);
        req.end();
    });
}

function sumCopilotNetAmountUsd(response: BillingUsageResponse): number {
    if (!Array.isArray(response.usageItems)) {
        return 0;
    }
    let usd = 0;
    for (const item of response.usageItems) {
        if (typeof item.product === 'string' && item.product.toLowerCase().includes('copilot')) {
            const amount = item.netAmount ?? item.grossAmount;
            if (typeof amount === 'number' && Number.isFinite(amount)) {
                usd += amount;
            }
        }
    }
    return usd;
}

/**
 * Fetch the signed-in user's Copilot usage for the current calendar month.
 * Returns undefined (not zero) on any failure so callers can fall back to
 * local-log estimates rather than reporting a misleading 0.
 */
export async function fetchCurrentMonthGitHubCreditUsage(): Promise<GitHubCreditUsage | undefined> {
    const session = await getSilentGitHubSession();
    const login = session?.account?.label?.trim();
    if (!session || !login) {
        return undefined;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // GitHub expects 1-based months.
    const url =
        `https://api.github.com/users/${encodeURIComponent(login)}/settings/billing/usage` +
        `?year=${year}&month=${month}`;

    let response: { status: number; body: string };
    try {
        response = await httpGetJson(url, session.accessToken);
    } catch {
        return undefined;
    }

    if (response.status < 200 || response.status >= 300) {
        // 401/403 (missing billing scope), 404 (no enhanced billing), etc.
        return undefined;
    }

    let parsed: BillingUsageResponse;
    try {
        parsed = JSON.parse(response.body) as BillingUsageResponse;
    } catch {
        return undefined;
    }

    const usd = sumCopilotNetAmountUsd(parsed);
    const nanoAiu = Math.max(0, Math.round(usd * AIC_PER_USD * NANO_AIU_PER_AIC));
    return { nanoAiu, login };
}
