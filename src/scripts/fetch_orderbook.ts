import axios from "axios";
import { OrderBook } from "../services/PolyMarketService";

async function fetchOrderBook(tokenId: string) {
    try {
        const response = await axios.get(`https://clob.polymarket.com/book?token_id=${tokenId}`);
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching order book:', error);
    }
}

fetchOrderBook('106995301959148590057310377289378701582753345526020106374309908715729740130427');
