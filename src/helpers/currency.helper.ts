import axios from 'axios';
import 'dotenv/config';
import { currencyToCountryMap } from './currency.data';

// --- In-Memory Cache ---
interface Cache {
  rates: Record<string, number> | null;
}

const cache: Cache = {
  rates: null,
};

/**
 * Fetches the latest exchange rates from the API, using a cache.
 * @param force - If true, forces a refresh of the cache.
 * @returns A promise that resolves to a record of currency rates against USD.
 */
const getLiveRates = async (force: boolean = false): Promise<Record<string, number>> => {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;

  // 1. Return cached rates if they exist and we are not forcing a refresh
  if (cache.rates && !force) {
    return cache.rates;
  }

  // 2. Check for API Key
  if (!apiKey) {
    throw new Error('EXCHANGE_RATE_API_KEY is not defined in the environment variables.');
  }

  // 3. Fetch new rates from the API
  try {
    const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
    if (response.data.result === 'error') {
      throw new Error(`ExchangeRate-API error: ${response.data['error-type']}`);
    }
    
    const rates = response.data.conversion_rates;

    // 4. Update cache
    cache.rates = rates;

    return rates;
  } catch (error: any) {
    console.error('Failed to fetch live exchange rates:', error.message);
    // If the API fails, we can fall back to the last known rates if they exist
    if (cache.rates) {
      return cache.rates;
    }
    throw new Error('Could not fetch live exchange rates and no cache is available.');
  }
};


// --- Public Functions ---

interface ConversionResult {
  from: string;
  to: string;
  amount: number;
  rate: number;
  convertedAmount: number;
  live: boolean;
}

/**
 * Converts an amount from a source currency to a target currency using live rates.
 * @param amount The amount to convert.
 * @param fromCurrency The source currency code (e.g., 'INR').
 * @param toCurrency The target currency code (e.g., 'USDT').
 * @returns A promise that resolves to a conversion result object.
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string = 'USDT'
): Promise<ConversionResult> => {
  const rates = await getLiveRates(); // Uses cache by default
  const from = fromCurrency.toUpperCase();
  const to = (toCurrency.toUpperCase() === 'USDT') ? 'USD' : toCurrency.toUpperCase();

  const fromRate = rates[from];
  const toRate = rates[to];

  if (fromRate === undefined) {
    throw new Error(`Source currency '${from}' is not supported.`);
  }
  if (toRate === undefined) {
    throw new Error(`Target currency '${to}' is not supported.`);
  }

  // Convert the amount from the source currency to the base currency (USD),
  // and then from the base currency to the target currency.
  const amountInUSD = amount / fromRate;
  const convertedAmount = amountInUSD * toRate;
  
  // The effective rate is the multiplier to get from the original amount to the final amount
  const effectiveRate = toRate / fromRate;

  return {
    from,
    to: toCurrency.toUpperCase(), // Return 'USDT' as requested
    amount,
    rate: parseFloat(effectiveRate.toFixed(6)),
    convertedAmount: parseFloat(convertedAmount.toFixed(6)),
    live: true,
  };
};

/**
 * Gets the list of supported currency codes from the live API.
 * @param force - If true, forces a refresh of the cache.
 * @returns An array of strings representing supported currencies.
 */
export const getSupportedCurrencies = async (force: boolean = false): Promise<string[]> => {
    const rates = await getLiveRates(force);
    return Object.keys(rates);
}

/**
 * Gets the entire live rates object, including country names.
 * @param force - If true, forces a refresh of the cache.
 * @returns A promise that resolves to a record of currency rates against USD, with country names.
 */
export const getLiveRatesObject = async (force: boolean = false): Promise<Record<string, { rate: number; countryName?: string; }>> => {
    const rates = await getLiveRates(force);
    const ratesWithCountry = Object.entries(rates).reduce((acc, [code, rate]) => {
        acc[code] = {
            rate,
            countryName: currencyToCountryMap[code.toUpperCase()],
        };
        return acc;
    }, {} as Record<string, { rate: number; countryName?: string; }>);
    return ratesWithCountry;
}