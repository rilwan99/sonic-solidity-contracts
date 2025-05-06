import { ethers } from "ethers";

import { getDefaultProvider } from "../helper/provider";
import { getTokenDecimals } from "../helper/token";
import { OdosClient } from "./client";
import { QuoteRequest, QuoteResponse } from "./types";

/**
 * Get a swap quote from Odos
 *
 * @param inputToken - The address of the input token
 * @param outputToken - The address of the output token
 * @param inputAmount - The amount of input tokens to swap
 * @param slippageLimitPercent - The slippage limit percentage
 * @param provider - The provider to use
 */
export async function getSwapQuote(
  inputToken: string,
  outputToken: string,
  inputAmount: string,
  slippageLimitPercent: number = 0.5,
  provider?: ethers.Provider,
): Promise<QuoteResponse> {
  // Set up provider if not provided
  provider = provider || (await getDefaultProvider());

  // Get decimals for input token
  const inputDecimals = await getTokenDecimals(inputToken, provider);
  // Format input amount to base units
  const inputAmountBaseUnits = ethers
    .parseUnits(inputAmount, inputDecimals)
    .toString();
  // Set up Odos client
  const odosClient = new OdosClient();

  // Get chainId
  const chainId = (await provider.getNetwork())?.chainId;

  if (!chainId) {
    throw new Error("ChainId not found");
  }

  // Build quote request
  const quoteRequest: QuoteRequest = {
    chainId: Number(chainId),
    inputTokens: [
      {
        tokenAddress: inputToken,
        amount: inputAmountBaseUnits,
      },
    ],
    outputTokens: [
      {
        tokenAddress: outputToken,
        proportion: 1,
      },
    ],
    userAddr: "0x000000000000000000000000000000000000dead", // Example user address
    slippageLimitPercent,
  };
  // Get quote
  return odosClient.getQuote(quoteRequest);
}

/**
 * Calculate the price of a baseToken in terms of a quoteToken using getSwapQuote output.
 *
 * @param baseToken - The address of the base token (e.g., EUR in EUR/USD)
 * @param quoteToken - The address of the quote token (e.g., USD in EUR/USD)
 * @param baseAmount - The amount of baseToken to check the price of
 * @param provider - The ethers provider
 * @returns The price (amount of quoteToken per 1 baseToken)
 */
export async function getBaseTokenPrice(
  baseToken: string,
  quoteToken: string,
  baseAmount: string = "1",
  provider?: ethers.Provider,
): Promise<number> {
  provider = provider || (await getDefaultProvider());
  // Get decimals for quote token
  const quoteDecimals = await getTokenDecimals(quoteToken, provider);
  // Get quote for swapping baseAmount of baseToken to quoteToken
  const quote = await getSwapQuote(
    baseToken,
    quoteToken,
    baseAmount,
    0.5,
    provider,
  );
  // Get the output amount in base units (should be first in outAmounts)
  const outAmountBaseUnits = quote.outAmounts[0];
  // Convert output amount to human-readable units
  const outAmount = ethers.formatUnits(outAmountBaseUnits, quoteDecimals);
  // Return as number (price = quote amount per 1 base token)
  return Number(outAmount) / Number(baseAmount);
}
