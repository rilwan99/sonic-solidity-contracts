import { ethers } from "ethers";
import { OdosClient } from "./client";
import { QuoteRequest } from "./types";

// Example input values
const inputToken = "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975"; // dUSD
const outputToken = "0x29219dd400f2bf60e5a23d13be72b486d4038894";
const inputAmount = "1000"; // 1000 dUSD (human readable)
const userAddr = "0x000000000000000000000000000000000000dead"; // Example user address
const chainId = 146;
const slippageLimitPercent = 0.5; // 0.5% slippage

async function getTokenDecimals(tokenAddress: string, provider: ethers.Provider): Promise<number> {
  const abi = ["function decimals() view returns (uint8)"];
  const contract = new ethers.Contract(tokenAddress, abi, provider);
  return await contract.decimals();
}

async function main() {
  const rpcUrl = "https://rpc.soniclabs.com";

  // Set up provider (use your own RPC URL or default to mainnet)
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Get decimals for input token
  const inputDecimals = await getTokenDecimals(inputToken, provider);

  // Format input amount to base units
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