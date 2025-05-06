import { getSwapQuote } from "./quote";

/**
 * Example usage of the getSwapQuote function
 */
async function main(): Promise<void> {
  const inputAmount = "1000"; // 1000 dUSD (human readable)
  const inputToken = "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975"; // dUSD
  const outputToken = "0x29219dd400f2bf60e5a23d13be72b486d4038894";

  const quote = await getSwapQuote(inputToken, outputToken, inputAmount);
  console.log("Quote result:", JSON.stringify(quote, null, 2));
}

main().catch((err) => {
  console.error("Error getting Odos quote:", err);
  process.exit(1);
});
