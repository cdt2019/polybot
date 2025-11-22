import axios from 'axios';

async function fetchEventDetails(slug: string) {
    const url = `https://gamma-api.polymarket.com/events?slug=${slug}`;
    try {
        const response = await axios.get(url);
        console.log(JSON.stringify(response.data, null, 2));
        // console.log(`Event Found: ${event.title}`);
        // console.log('Markets:');
        // event.markets.forEach(m => {
        //     console.log(`- Question: ${m.question}`);
        //     console.log(`  Group Item Title: ${m.groupItemTitle}`);
        //     console.log(`  Slug: ${m.slug}`);
        //     console.log(`  Outcomes: ${m.outcomes}`);
        //     console.log(`  Token IDs: ${m.clobTokenIds}`);
        //     console.log('---');
        // });
    } catch (error) {
        console.error('Error fetching event:', error);
    }
}

fetchEventDetails('google-gemini-3-score-on-humanitys-last-exam-by-january-31');
