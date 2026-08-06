import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendEmailAdapter } from "../../adapters/email/resendEmailAdapter";

describe("ResendEmailAdapter.sendStaleAlert", () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM_ADDRESS;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM_ADDRESS = "alerts@docket.test";
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.EMAIL_FROM_ADDRESS = originalFrom;
    vi.unstubAllGlobals();
  });

  it("posts to the Resend API with the expected headers and body", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ResendEmailAdapter();
    await adapter.sendStaleAlert({ to: ["a@x.com", "b@x.com"], documentId: "doc-1", documentName: "Motion.pdf", agingDays: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key", "Content-Type": "application/json" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.from).toBe("alerts@docket.test");
    expect(body.to).toEqual(["a@x.com", "b@x.com"]);
    expect(body.text).toContain("Motion.pdf");
    expect(body.text).toContain("5 days");
  });

  it("throws if RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const adapter = new ResendEmailAdapter();

    await expect(adapter.sendStaleAlert({ to: ["a@x.com"], documentId: "doc-1", documentName: "Motion.pdf", agingDays: 5 })).rejects.toThrow(
      /RESEND_API_KEY/,
    );
  });

  it("throws if EMAIL_FROM_ADDRESS is missing", async () => {
    delete process.env.EMAIL_FROM_ADDRESS;
    const adapter = new ResendEmailAdapter();

    await expect(adapter.sendStaleAlert({ to: ["a@x.com"], documentId: "doc-1", documentName: "Motion.pdf", agingDays: 5 })).rejects.toThrow(
      /EMAIL_FROM_ADDRESS/,
    );
  });

  it("throws if the Resend API responds with a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const adapter = new ResendEmailAdapter();

    await expect(adapter.sendStaleAlert({ to: ["a@x.com"], documentId: "doc-1", documentName: "Motion.pdf", agingDays: 5 })).rejects.toThrow(
      /500/,
    );
  });
});
