import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../../adapters/crypto/tokenCipher";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "Bzyuseu9/yH7/F0sHlxeFru+C9lvwziz66mbKIF/0sA=";
});

describe("tokenCipher", () => {
  it("round-trips a value", () => {
    const ciphertext = encrypt("super-secret-token");
    expect(ciphertext).not.toContain("super-secret-token");
    expect(decrypt(ciphertext)).toBe("super-secret-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same-input");
    const b = encrypt("same-input");
    expect(a).not.toBe(b);
  });

  it("fails to decrypt a tampered ciphertext (GCM auth tag)", () => {
    const ciphertext = encrypt("super-secret-token");
    const [iv, tag, body] = ciphertext.split(":");
    const tampered = [iv, tag, body.slice(0, -2) + (body.at(-1) === "A" ? "B" : "A") + body.at(-2)].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a malformed ciphertext string", () => {
    expect(() => decrypt("not-a-valid-ciphertext")).toThrow(/Malformed ciphertext/);
  });
});
