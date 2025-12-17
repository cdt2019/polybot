import fetch from 'node-fetch';
import { Monitor, Notifier } from '../core/types';
import { logger } from '../core/logger';
import axios from 'axios';
import fs from 'fs';

async function main() {


    const html = await axios.get(
        'https://lmarena.ai/leaderboard/text/overall-no-style-control',
        {
            headers: {
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }
    ).then(r => r.data);
    //const html = fs.readFileSync('C:\\Users\\cxw\\Desktop\\lmarena.html', 'utf-8');
    // 提取 self.__next_f.push([...])
    const pushes = [...html.matchAll(/__next_f\.push\(\[(\d+),([\s\S]*?)\]\)/g)];

    const payloads: string[] = [];

    for (const m of pushes) {
        const type = Number(m[1]);
        const body = m[2].trim();

        if (type !== 1) continue;

        // body 通常是字符串
        if (body.startsWith("\"")) {
            const decoded = JSON.parse(body);
            payloads.push(decoded);
        }
    }
    const leaderboard = payloads.filter(p => p.includes('"leaderboardSlug":"overall-no-style-control"'));
    const node = parseFlightNode(leaderboard[0]);
    console.log(node)
    //console.log(JSON.stringify(node?.leaderboard, null, 2))
}

function parseFlightNode(raw: string) {
    // 去掉前面的 "9:"
    const idx = raw.indexOf(":");
    if (idx === -1) return null;

    const body = raw.slice(idx + 1);

    // body 现在是 ["$", "$L16", null, {...}]
    const arr = JSON.parse(body);

    // 第 4 个元素是 props
    const props = arr[3];
    return props;
}


main().catch(console.error);