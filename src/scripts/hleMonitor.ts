import { HLEMonitor } from "../monitors/HLEMonitor";

async function main() {
    const monitor = new HLEMonitor();
    const data = await monitor.poll();
    console.log(data);
}

main().catch(console.error);

//  node dist/index.js --monitor=HLEMonitor --strategy=Gemini3HLEStrategy --interval=60