import puppeteer from 'puppeteer';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';
import axios from 'axios';

export interface LMArenaData {
    rank: number;
    rankUpper: number;
    rankLower: number;
    rankStyleControl: number;
    modelDisplayName: string;
    rating: number;
    ratingUpper: number;
    ratingLower: number;
    votes: number;
    modelOrganization: string;
    modelUrl: string;
    license: string;
}

export interface LMArenaResult {
    voteCutoffISOString: string;
    totalVotes: number;
    totalModels: number;
    entries: LMArenaData[];
}

export function extractFlightPayloads(html: string): string[] {
    const pushes = [
        ...html.matchAll(/__next_f\.push\(\[(\d+),([\s\S]*?)\]\)/g),
    ];

    const payloads: string[] = [];

    for (const m of pushes) {
        const type = Number(m[1]);
        const body = m[2].trim();

        if (type !== 1) continue;
        if (!body.startsWith('"')) continue;

        try {
            const decoded = JSON.parse(body);
            payloads.push(decoded);
        } catch (e) {
            logger.error('[LMArenaTextMonitor] Failed to parse flight payload: ' + body, e);
        }
    }
    return payloads;
}

export function parseFlightNode(raw: string): any | null {
    const idx = raw.indexOf(":");
    if (idx === -1) return null;

    const body = raw.slice(idx + 1);
    const arr = JSON.parse(body);
    return arr[3]; // props
}

export class LMArenaTextMonitor implements Monitor<LMArenaResult> {
    protected notifier?: Notifier;
    protected url = 'https://lmarena.ai/leaderboard/text';

    setNotifier(notifier: Notifier): void {
        this.notifier = notifier;
    }

    extractLeaderboard(payloads: string[]): LMArenaResult | null {
        const hit = payloads.find(p =>
            p.includes('"leaderboardSlug":"overall-no-style-control"')
            || p.includes('"leaderboardSlug":"overall"')
        );
        if (!hit) return null;

        const node = parseFlightNode(hit);
        if (!node?.leaderboard) return null;

        return node.leaderboard as LMArenaResult;
    }

    async poll(): Promise<LMArenaResult> {
        const emptyResult = {
            voteCutoffISOString: '',
            totalVotes: 0,
            totalModels: 0,
            entries: []
        } as LMArenaResult;
        try {
            const res = await axios.get(this.url, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
                    Accept: "text/html",
                },
                timeout: 60000,
            });
            if (res.status !== 200) {
                logger.warn('[LMArenaTextMonitor] Failed to fetch leaderboard data: ' + res.status);
                return emptyResult;
            }
            const content = res.data;
            const payloads = extractFlightPayloads(content);
            const leaderboard = this.extractLeaderboard(payloads);
            if (!leaderboard) {
                logger.warn('[LMArenaTextMonitor] No leaderboard data found');
                return emptyResult;

            }

            const top20 = leaderboard.entries.slice(0, 20);
            const result = {
                voteCutoffISOString: leaderboard.voteCutoffISOString || '',
                totalVotes: leaderboard.totalVotes || 0,
                totalModels: leaderboard.totalModels || 0,
                entries: top20
            };
            logger.info(`[LMArenaTextMonitor] Found ${result.entries.length} distinct models`);
            return result;
        } catch (error) {
            logger.error('Error polling LMArena leaderboard:', error);
        }
        return emptyResult;
    }
}
