import { ethers } from "ethers";

/**
 * Get the decimals of a token
 *
 * @param tokenAddress - The address of the token
 * @param provider - The provider to use
 * @returns The decimals of the token
 */
export async function getTokenDecimals(
  tokenAddress: string,
  provider: ethers.Provider,
): Promise<number> {
  const abi = ["function decimals() view returns (uint8)"];
  const contract = new ethers.Contract(tokenAddress, abi, provider);
  return await contract.decimals();
}
