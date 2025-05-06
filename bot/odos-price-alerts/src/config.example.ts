import { Config } from "./lambda/config-types";

export const config: Config = {
  slackWebhookUrl: "YOUR_SLACK_WEBHOOK_URL",
  pairs: [
    {
      // dUSD/USDC.e
      rpcUrl: "https://rpc.soniclabs.com",
      blockchainId: "sonic_mainnet",
      baseToken: "0x53a6aBb52B2F968fA80dF6A894e4f1b1020DA975",
      quoteToken: "0x29219dd400f2bf60e5a23d13be72b486d4038894",
      baseAmount: "100",
      lowerThreshold: 0.985,
      upperThreshold: 1.005,
    },
  ],
}; 