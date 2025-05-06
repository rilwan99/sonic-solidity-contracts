import { ethers } from "ethers";
import { OdosClient } from "./client";
import { QuoteRequest } from "./types";
import { SONIC_MAINNET_CONFIG } from "../config/config";

async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  const abi = ["function decimals() view returns (uint8)"];
  const contract = new ethers.Contract(tokenAddress, abi, provider);
  return await contract.decimals();
}

async function main() {
  const {
    chainId,
    rpcUrl,
    inputToken,
    outputToken,
    userAddr,
    slippageLimitPercent,
  } = SONIC_MAINNET_CONFIG;

  // Set up provider
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Get decimals for input token
  const inputDecimals = await getTokenDecimals(inputToken, provider);

  // Format input amount to base units
  const inputAmount = "1000"; // 1000 dUSD (human readable)
  const inputAmountBaseUnits = ethers.parseUnits(inputAmount, inputDecimals).toString();

  // Set up Odos client
  const odosClient = new OdosClient();

  // Build quote request
  const quoteRequest: QuoteRequest = {
    chainId,
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