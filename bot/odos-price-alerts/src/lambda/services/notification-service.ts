import { IncomingWebhook } from "@slack/webhook";
import { PriceAlert } from "./price-checker";

// A map for base token to currency symbol
const baseTokenSymbolToCurrencySymbol: Record<string, string> = {
  "dUSD": "USD",
  "dS": "S",
};

export class NotificationService {
  private webhook: IncomingWebhook;

  constructor(webhookUrl: string) {
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async sendAlert(alert: PriceAlert): Promise<void> {
    const emoji = alert.thresholdType === "lower" ? "📉" : "📈";
    const thresholdText =
      alert.thresholdType === "lower"
        ? "below lower threshold"
        : "above upper threshold";

    let currencySymbol = "";
    if (alert.symbol in baseTokenSymbolToCurrencySymbol) {
      currencySymbol = baseTokenSymbolToCurrencySymbol[alert.symbol];
    } else {
      throw new Error(`No currency symbol found for ${alert.symbol}`);
    }

    const message = {
      text: `${emoji} Price Alert for ${alert.symbol} on ${alert.blockchainId}!`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Price Alert for ${alert.symbol} on ${alert.blockchainId}*\n\n` +
              `Current Price: ${alert.currentPrice.toFixed(
                4
              )} ${currencySymbol} (${thresholdText})\n` +
              `${
                alert.thresholdType === "lower" ? "Lower" : "Upper"
              } Threshold: ${alert.breachedThreshold.toFixed(4)} ${currencySymbol}\n` +
              `Time: ${new Date(alert.timestamp).toLocaleString()}`,
          },
        },
      ],
    };

    try {
      await this.webhook.send(message);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send Slack notification: ${error.message}`);
      }
      throw error;
    }
  }
} 