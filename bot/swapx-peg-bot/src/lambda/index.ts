import { ScheduledEvent } from "aws-lambda";
import { OdosService } from "./services/odos-service";
import { PriceChecker } from "./services/price-checker";
import { NotificationService } from "./services/notification-service";
import { config } from "./config";
import { getRpcProvider } from "./helper/provider";

export const handler = async (
  event: ScheduledEvent
): Promise<{ statusCode: number; body: string }> => {
  console.log("Event:", JSON.stringify(event, null, 2));

  const notificationService = new NotificationService(config.slackWebhookUrl);

  for (const pair of config.pairs) {
    try {
      const provider = await getRpcProvider(pair.rpcUrl);
      const odosService = new OdosService(pair.blockchainId, provider);

      const tokenPrice = await odosService.getTokenPrice(
        "TOKEN", // Symbol placeholder since it's not used meaningfully
        pair.baseToken,
        pair.quoteToken
      );

      console.log(
        `Current price for ${pair.baseToken}/${pair.quoteToken}: ${tokenPrice.price}`
      );

      const priceChecker = new PriceChecker(
        pair.lowerThreshold,
        pair.upperThreshold
      );
      const alert = priceChecker.checkPrice(tokenPrice);

      if (alert) {
        await notificationService.sendAlert(alert);
      }
    } catch (error) {
      console.error(
        `Error checking price for ${pair.baseToken}/${pair.quoteToken}:`,
        error
      );
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Success" }),
  };
};