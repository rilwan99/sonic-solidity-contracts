export interface PairConfig {
  blockchainId: string;
  rpcUrl: string;
  baseToken: string;
  quoteToken: string;
  baseAmount: string; // for price quote
  lowerThreshold: number;
  upperThreshold: number;
}

export interface Config {
  slackWebhookUrl: string;
  pairs: PairConfig[];
}
