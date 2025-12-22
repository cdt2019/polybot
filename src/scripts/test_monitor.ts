import { Gemini3FlashMonitor } from "../monitors/Gemini3FlashMonitor";
import { HLEMonitor } from "../monitors/HLEMonitor";
import { LiveBenchMonitor } from "../monitors/LiveBenchMonitor";
import { LMArenaTextMonitor } from "../monitors/LMArenaTextMonitor";
import { LMArenaTextNoStyleMonitor } from "../monitors/LMArenaTextNoStyleMonitor";

async function main() {
    const monitor = new LiveBenchMonitor();
    const data = await monitor.poll();
    console.log(JSON.stringify(data, null, 2));
    process.exit(0); // Force exit to prevent Puppeteer lingering
}

main().catch(console.error);

//  node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy --interval=60