import { HLEMonitor } from "../monitors/HLEMonitor";
import { LiveBenchCodingMonitor } from "../monitors/LiveBenchCodingMonitor";
import { LMArenaTextMonitor } from "../monitors/LMArenaTextMonitor";
import { LMArenaTextNotStyleMonitor } from "../monitors/LMArenaTextNotStyleMonitor";

async function main() {
    const monitor = new LMArenaTextNotStyleMonitor();
    const data = await monitor.poll();
    console.log(JSON.stringify(data, null, 2));
    process.exit(0); // Force exit to prevent Puppeteer lingering
}

main().catch(console.error);

//  node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy --interval=60