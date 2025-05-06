import { IncomingWebhook } from "@slack/webhook";
import { PriceAlert } from "./price-checker";

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

    const message = {
      text: `${emoji} Price Alert for ${alert.symbol} on ${alert.blockchainId}!`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Price Alert for ${alert.symbol} on ${alert.blockchainId}*\n\n` +
              `Current Price: $${alert.currentPrice.toFixed(
                4
              )} (${thresholdText})\n` +
              `${
                alert.thresholdType === "lower" ? "Lower" : "Upper"
              } Threshold: $${alert.breachedThreshold.toFixed(4)}\n` +
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