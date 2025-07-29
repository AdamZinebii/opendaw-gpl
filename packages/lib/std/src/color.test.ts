import {describe, expect, it} from "vitest"
import {Color} from "./color"
import hslStringToHex = Color.hslStringToHex

describe("color", () => {
    it("parse", () => {
        expect(Color.parseCssRgbOrRgba("rgb(0, 0, 0)")).toStrictEqual([0, 0, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 0, 0)")).toStrictEqual([1, 0, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 255, 0)")).toStrictEqual([1, 1, 0, 1])
        expect(Color.parseCssRgbOrRgba("rgb(255, 255, 255)")).toStrictEqual([1, 1, 1, 1])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 0.0)")).toStrictEqual([1, 1, 1, 0])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 0.5)")).toStrictEqual([1, 1, 1, 0.5])
        expect(Color.parseCssRgbOrRgba("rgba(255, 255, 255, 1.0)")).toStrictEqual([1, 1, 1, 1])
        expect(Color.parseCssRgbOrRgba("    rgba( 127.5 ,  255 ,     255,    1.0 )   ")).toStrictEqual([0.5, 1, 1, 1])
        expect(() => Color.parseCssRgbOrRgba("rgba(foo,255,255,1.0)")).toThrow()
    })
    it("converts primary colors", () => {
        expect(hslStringToHex("hsl(0,100%,50%)")).toBe("#ff0000")     // Red
        expect(hslStringToHex("hsl(120,100%,50%)")).toBe("#00ff00")   // Green
        expect(hslStringToHex("hsl(240,100%,50%)")).toBe("#0000ff")   // Blue
    })
    it("converts secondary colors", () => {
        expect(hslStringToHex("hsl(60,100%,50%)")).toBe("#ffff00")    // Yellow
        expect(hslStringToHex("hsl(180,100%,50%)")).toBe("#00ffff")   // Cyan
        expect(hslStringToHex("hsl(300,100%,50%)")).toBe("#ff00ff")   // Magenta
    })
    it("handles neutral tones", () => {
        expect(hslStringToHex("hsl(0,0%,50%)")).toBe("#808080")       // Gray
    })
    it("converts custom color", () => {
        expect(hslStringToHex("hsl(30,60%,75%)")).toBe("#e6bf99")
    })
})