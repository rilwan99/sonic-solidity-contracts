import { getBaseTokenPrice } from "../odos/quote";

/**
 * Example usage of the getBaseTokenPrice function
 */
async function main(): Promise<void> {
  const baseToken = "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975"; // dUSD
  const quoteToken = "0x29219dd400f2bf60e5a23d13be72b486d4038894"; // Example quote token

  try {
    const price = await getBaseTokenPrice(baseToken, quoteToken);
    console.log(`Price with 1 base token: ${price}`);
    const price2 = await getBaseTokenPrice(baseToken, quoteToken, "1000");
    console.log(`Price with 1000 base token: ${price2}`);
  } catch (err) {
    console.error("Error getting base token price:", err);
    process.exit(1);
  }
}

main();
