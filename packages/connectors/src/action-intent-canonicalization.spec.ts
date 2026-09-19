import { describe, expect, it } from "vitest"
import {
  ACTION_INTENT_DIGEST_VERSION,
  canonicalizeActionIntent,
  digestActionIntent,
} from "./action-intent-canonicalization.js"

const rfc8785CanonicalHex = `
7b 22 6c 69 74 65 72 61 6c 73 22 3a 5b 6e 75 6c 6c 2c 74 72
75 65 2c 66 61 6c 73 65 5d 2c 22 6e 75 6d 62 65 72 73 22 3a
5b 33 33 33 33 33 33 33 33 33 2e 33 33 33 33 33 33 33 2c 31
65 2b 33 30 2c 34 2e 35 2c 30 2e 30 30 32 2c 31 65 2d 32 37
5d 2c 22 73 74 72 69 6e 67 22 3a 22 e2 82 ac 24 5c 75 30 30
30 66 5c 6e 41 27 42 5c 22 5c 5c 5c 5c 5c 22 2f 22 7d
`

function rfc8785CanonicalValue(): string {
  return Buffer.from(rfc8785CanonicalHex.replace(/\s/g, ""), "hex").toString(
    "utf8"
  )
}

function ieee754(hex: string): number {
  const value = Buffer.alloc(8)
  value.writeBigUInt64BE(BigInt(`0x${hex}`))
  return value.readDoubleBE()
}

describe("Action Intent canonicalization", () => {
  it("matches the RFC 8785 primitive serialization vector", () => {
    const input: unknown = JSON.parse(
      String.raw`{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/","literals":[null,true,false]}`
    )
    expect(canonicalizeActionIntent(input)).toBe(rfc8785CanonicalValue())
    expect(digestActionIntent(input)).toBe(
      "LV4BoxjQ8IeatWjEviicix9k74khpTxid9XgaZeLqss"
    )
    expect(ACTION_INTENT_DIGEST_VERSION).toBe("jcs-sha256-v1")
  })

  it("sorts property names by their raw UTF-16 code units", () => {
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      דּ: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      ö: "Latin Small Letter O With Diaeresis",
    }
    expect(canonicalizeActionIntent(input)).toBe(
      `{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}`
    )
  })

  it.each([
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"],
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
  ])("serializes RFC 8785 IEEE 754 vector %s", (hex, expected) => {
    expect(canonicalizeActionIntent(ieee754(hex))).toBe(expected)
  })

  it("rejects values outside the I-JSON domain", () => {
    expect(() => canonicalizeActionIntent(Number.NaN)).toThrow(
      "I-JSON numbers must be finite"
    )
    expect(() => canonicalizeActionIntent("\ud800")).toThrow(
      "I-JSON strings must contain valid Unicode"
    )
    expect(() => canonicalizeActionIntent({ missing: undefined })).toThrow(
      "Value is not I-JSON compatible"
    )
  })
})
