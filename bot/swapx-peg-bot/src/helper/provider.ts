import { ethers } from "ethers";
import { DEFAULT_CONFIG } from "../config/config";

/**
 * Get a default provider for the given chainId
 * @returns {Promise<ethers.JsonRpcProvider>}
 */
export async function getDefaultProvider(): Promise<ethers.JsonRpcProvider> {
  return new ethers.JsonRpcProvider(DEFAULT_CONFIG.rpcUrl);
}
