import { ethers } from "ethers";

export async function getRpcProvider(rpcUrl: string): Promise<ethers.JsonRpcProvider> {
  return new ethers.JsonRpcProvider(rpcUrl);
} 