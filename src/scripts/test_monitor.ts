import { HLEMonitor } from "../monitors/HLEMonitor";
import { LiveBenchCodingMonitor } from "../monitors/LiveBenchCodingMonitor";

async function main() {
    const monitor = new LiveBenchCodingMonitor();
    const data = await monitor.poll();
    console.log(data);
    process.exit(0); // Force exit to prevent Puppeteer lingering
}

main().catch(console.error);

//  node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy --interval=60