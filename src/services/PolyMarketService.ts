import axios from 'axios';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';

export interface Market {
    id: string;
    question: string;
    slug: string;
    clobTokenIds: string[];
    outcomes: string[];
    groupItemTitle: string
}

export interface Event {
    id: string;
    slug: string;
    title: string;
    markets: Market[];
}

export interface OrderBook {
    hash: string;
    bids: OrderSummary[];
    asks: OrderSummary[];
}

export interface OrderSummary {
    price: string;
    size: string;
}

export class PolyMarketService {
    /**
     * Fetches event details by slug.
     * @param slug The event slug (e.g. "google-gemini-3-score-on-lmarena-by-december-31")
     */
    static async getEventBySlug(slug: string): Promise<Event | null> {
        try {
            const response = await axios.get(`${GAMMA_API_URL}/events?slug=${slug}`);
            if (Array.isArray(response.data) && response.data.length > 0) {
                const event = response.data[0];
                // Parse markets to ensure clobTokenIds and outcomes are arrays
                if (event.markets) {
                    event.markets = event.markets.map((m: any) => ({
                        ...m,
                        clobTokenIds: typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds,
                        outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes
                    }));
                }
                return event as Event;
            }
            return null;
        } catch (error) {
            console.error('Error fetching event:', error);
            return null;
        }
    }

    /**
     * Helper to find a specific market within an event by question or just return the first one.
     */
    static async getMarketForEvent(slug: string, filter?: string): Promise<Market | null> {
        const event = await this.getEventBySlug(slug);
        if (!event || !event.markets) return null;

        if (filter) {
            return event.markets.find(m => m.question.includes(filter) || m.groupItemTitle?.includes(filter)) || null;
        }
        return event.markets[0];
    }

    /**
     * Fetches the order book for a given token ID from the CLOB API.
     */
    static async getOrderBook(tokenId: string): Promise<OrderBook | null> {
        try {
            const response = await axios.get(`https://clob.polymarket.com/book?token_id=${tokenId}`);
            return response.data as OrderBook;
        } catch (error) {
            console.error('Error fetching order book:', error);
            return null;
        }
    }
}
