export interface PriceAlert {
  symbol: string;
  currentPrice: number;
  breachedThreshold: number;
  thresholdType: "lower" | "upper";
  timestamp: string;
  blockchainId: string;
}

export class PriceChecker {
  constructor(
    private readonly lowerThreshold: number,
    private readonly upperThreshold: number
  ) {}

  checkPrice(tokenPrice: { symbol: string; price: number; blockchainId: string }): PriceAlert | null {
    if (tokenPrice.price < this.lowerThreshold) {
      return {
        symbol: tokenPrice.symbol,
        currentPrice: tokenPrice.price,
        breachedThreshold: this.lowerThreshold,
        thresholdType: "lower",
        timestamp: new Date().toISOString(),
        blockchainId: tokenPrice.blockchainId,
      };
    }

    if (tokenPrice.price > this.upperThreshold) {
      return {
        symbol: tokenPrice.symbol,
        currentPrice: tokenPrice.price,
        breachedThreshold: this.upperThreshold,
        thresholdType: "upper",
        timestamp: new Date().toISOString(),
        blockchainId: tokenPrice.blockchainId,
      };
    }

    return null;
  }
} 