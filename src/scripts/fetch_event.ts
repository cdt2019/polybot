import axios from 'axios';

async function fetchEventDetails(slug: string) {
    const url = `https://gamma-api.polymarket.com/events?slug=${slug}`;
    try {
        const response = await axios.get(url);
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching event:', error);
    }
}

fetchEventDetails('google-gemini-3-score-on-humanitys-last-exam-by-january-31');
