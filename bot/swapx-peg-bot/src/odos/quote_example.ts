import { ethers } from "ethers";
import { OdosClient } from "./client";
import { QuoteRequest, QuoteResponse } from "./types";
import { getDefaultProvider } from "../helper/provider";
import { getTokenDecimals } from "../helper/token";

async function getSwapQuote(
  inputToken: string,
  outputToken: string,
  inputAmount: string,
  slippageLimitPercent: number = 0.5,
  provider?: ethers.Provider
): Promise<QuoteResponse> {
  // Set up provider if not provided
  provider = provider || await getDefaultProvider();

  // Get decimals for input token
  const inputDecimals = await getTokenDecimals(inputToken, provider);
  // Format input amount to base units
  const inputAmountBaseUnits = ethers.parseUnits(inputAmount, inputDecimals).toString();
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

async function main() {
  const inputAmount = "1000"; // 1000 dUSD (human readable)
  const inputToken = "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975"; // dUSD
  const outputToken = "0x29219dd400f2bf60e5a23d13be72b486d4038894";

  const quote = await getSwapQuote(
    inputToken,
    outputToken,
    inputAmount,
  );
  console.log("Quote result:", JSON.stringify(quote, null, 2));
}

main().catch((err) => {
  console.error("Error getting Odos quote:", err);
  process.exit(1);
}); 