import { getBaseTokenPrice } from "../odos/quote";

/**
 * Script to fetch the price of a base token in terms of a quote token.
 * Usage: ts-node run.ts <baseTokenAddress> <quoteTokenAddress>
 */
async function main(): Promise<void> {
  // Example token addresses (replace with desired tokens or parse from CLI)
  const baseToken = process.argv[2]; // e.g., EUR token address
  const quoteToken = process.argv[3]; // e.g., USD token address

  if (!baseToken || !quoteToken) {
    console.error(
      "Usage: ts-node run.ts <baseTokenAddress> <quoteTokenAddress>",
    );
    process.exit(1);
  }

  try {
    const price = await getBaseTokenPrice(baseToken, quoteToken);
    console.log(
      `Price of 1 base token (${baseToken}) in quote token (${quoteToken}): ${price}`,
    );
  } catch (err) {
    console.error("Error getting base token price:", err);
    process.exit(1);
  }
}

main();
