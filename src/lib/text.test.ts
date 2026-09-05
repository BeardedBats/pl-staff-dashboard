import { describe, expect, it } from "vitest";
import { decodeProviderText } from "./text";
describe("provider text", () => {
  it("decodes WordPress punctuation without double decoding", () => {
    expect(decodeProviderText("9/5 &#038; 9/6 &#039; &#x2019; &amp;lt;")).toBe("9/5 & 9/6 ' ’ &lt;");
  });
  it("preserves unknown and invalid entities", () => {
    expect(decodeProviderText("&unknown; &#1114112; &#55296;")).toBe("&unknown; &#1114112; &#55296;");
  });
});
