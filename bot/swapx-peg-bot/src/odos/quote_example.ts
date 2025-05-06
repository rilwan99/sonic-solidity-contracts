import { ethers } from "ethers";
import { OdosClient } from "./client";
import { QuoteRequest } from "./types";
import { SONIC_MAINNET_CONFIG } from "../config/config";
import { getDefaultProvider } from "../helper/provider";
import { getTokenDecimals } from "../helper/token";

async function main() {
  // Set up provider
  const provider = await getDefaultProvider();

  const inputAmount = "1000"; // 1000 dUSD (human readable)
  const inputToken = "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975"; // dUSD
  const outputToken = "0x29219dd400f2bf60e5a23d13be72b486d4038894";
  const userAddr = "0x000000000000000000000000000000000000dead"; // Example user address
  const slippageLimitPercent = 0.5;

  // Get decimals for input token
  const inputDecimals = await getTokenDecimals(inputToken, provider);

  // Format input amount to base units
  const inputAmountBaseUnits = ethers.parseUnits(inputAmount, inputDecimals).toString();

  // Set up Odos client
  const odosClient = new OdosClient();

  // Build quote request
  const quoteRequest: QuoteRequest = {
    chainId: SONIC_MAINNET_CONFIG.chainId,
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
    userAddr,
    slippageLimitPercent,
  };

  // Get quote
  const quote = await odosClient.getQuote(quoteRequest);
  console.log("Quote result:", JSON.stringify(quote, null, 2));
}

main().catch((err) => {
  console.error("Error getting Odos quote:", err);
  process.exit(1);
}); 