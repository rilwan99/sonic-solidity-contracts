import { ethers } from "ethers";
import { getTokenDecimals } from "../helper/token";

export interface TokenPrice {
  symbol: string;
  price: number;
  blockchainId: string;
}

// --- OdosClient logic (minimal for quote) ---
import axios from "axios";

class OdosClient {
  private readonly baseUrl: string;
  private readonly chainId?: number;
  constructor(baseUrl = "https://api.odos.xyz", chainId?: number) {
    this.baseUrl = baseUrl;
    this.chainId = chainId;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getQuote(request: any): Promise<any> {
    if (this.chainId && request.chainId !== this.chainId) {
      throw new Error(
        `Chain ID mismatch. Expected ${this.chainId}, got ${request.chainId}`,
      );
    }
    const response = await axios.post(
      `${this.baseUrl}/sor/quote/v2`,
      request,
      { headers: { "Content-Type": "application/json" } },
    );
    if (!response.data || !response.data.pathId || !response.data.outTokens || !response.data.outAmounts) {
      throw new Error("Invalid response from ODOS API: Missing required fields");
    }
    return response.data;
  }
}

// --- getSwapQuote logic ---
export async function getSwapQuote(
  inputToken: string,
  outputToken: string,
  inputAmount: string,
  slippageLimitPercent = 0.5,
  provider: ethers.Provider,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const inputDecimals = await getTokenDecimals(inputToken, provider);
  const inputAmountBaseUnits = ethers.parseUnits(inputAmount, inputDecimals).toString();
  const odosClient = new OdosClient();
  const chainId = (await provider.getNetwork())?.chainId;
  if (!chainId) throw new Error("ChainId not found");
  const quoteRequest = {
    chainId: Number(chainId),
    inputTokens: [
      { tokenAddress: inputToken, amount: inputAmountBaseUnits },
    ],
    outputTokens: [
      { tokenAddress: outputToken, proportion: 1 },
    ],
    userAddr: "0x000000000000000000000000000000000000dead",
    slippageLimitPercent,
  };
  return odosClient.getQuote(quoteRequest);
}

// --- getBaseTokenPrice logic ---
export async function getBaseTokenPrice(
  baseToken: string,
  quoteToken: string,
  baseAmount = "1",
  provider: ethers.Provider,
): Promise<number> {
  const quoteDecimals = await getTokenDecimals(quoteToken, provider);
  const quote = await getSwapQuote(baseToken, quoteToken, baseAmount, 0.5, provider);
  const outAmountBaseUnits = quote.outAmounts[0];
  const outAmount = ethers.formatUnits(outAmountBaseUnits, quoteDecimals);
  return Number(outAmount) / Number(baseAmount);
}

export class OdosService {
  private readonly blockchainId: string;
  private readonly provider: ethers.Provider;
  constructor(blockchainId: string, provider: ethers.Provider) {
    this.blockchainId = blockchainId;
    this.provider = provider;
  }
  async getTokenPrice(symbol: string, baseToken: string, quoteToken: string): Promise<TokenPrice> {
    const price = await getBaseTokenPrice(baseToken, quoteToken, "1", this.provider);
    return {
      symbol,
      price: Number(price),
      blockchainId: this.blockchainId,
    };
  }
} 