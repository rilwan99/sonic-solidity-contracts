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
