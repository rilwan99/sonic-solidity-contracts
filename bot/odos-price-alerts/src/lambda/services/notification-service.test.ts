import { NotificationService } from "./notification-service";
import { config } from "../config";
import { IncomingWebhook } from "@slack/webhook";

jest.mock("@slack/webhook");
const mockedWebhook = {
  send: jest.fn(),
};
(IncomingWebhook as jest.Mock).mockImplementation(() => mockedWebhook);

describe("NotificationService", () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    notificationService = new NotificationService(config.slackWebhookUrl);
    mockedWebhook.send.mockClear();
  });

  it("should send alert to Slack webhook", async () => {
    const mockAlert = {
      symbol: "TEST/USDC",
      blockchainId: "test_chain",
      currentPrice: 1.2,
      breachedThreshold: 1.1,
      thresholdType: "upper" as const,
      timestamp: new Date().toISOString(),
    };

    // This will send a real notification to Slack
    await expect(notificationService.sendAlert(mockAlert)).resolves.not.toThrow();

    // Add a small delay to avoid rate limiting if running multiple tests
    // eslint-disable-next-line no-undef
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it("should send alert for lower threshold", async () => {
    const mockAlert = {
      symbol: "TEST/USDC",
      blockchainId: "test_chain",
      currentPrice: 0.9,
      breachedThreshold: 0.95,
      thresholdType: "lower" as const,
      timestamp: new Date().toISOString(),
    };

    // This will send a real notification to Slack
    await expect(notificationService.sendAlert(mockAlert)).resolves.not.toThrow();

    // Add a small delay to avoid rate limiting if running multiple tests
    // eslint-disable-next-line no-undef
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it("should call webhook.send with correct message (mocked webhook)", async () => {
    const mockAlert = {
      symbol: "MOCK/USDC",
      blockchainId: "mock_chain",
      currentPrice: 2.5,
      breachedThreshold: 2.0,
      thresholdType: "upper" as const,
      timestamp: new Date().toISOString(),
    };

    await expect(notificationService.sendAlert(mockAlert)).resolves.not.toThrow();
    expect(mockedWebhook.send).toHaveBeenCalledTimes(1);
    const sentMessage = mockedWebhook.send.mock.calls[0][0];
    expect(sentMessage.text).toContain("MOCK/USDC");
    expect(sentMessage.text).toContain("mock_chain");
    expect(sentMessage.text).toContain("📈");
    expect(sentMessage.blocks[0].text.text).toContain("2.5");
    expect(sentMessage.blocks[0].text.text).toContain("above upper threshold");
  });
});
