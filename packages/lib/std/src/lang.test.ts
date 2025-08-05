import {describe, expect, it} from "vitest"
import {ifDefined, isValidIdentifier} from "./lang"

describe("lang", () => {
    it("isValidIdentifier", () => {
        expect(isValidIdentifier("")).false
        expect(isValidIdentifier("42")).false
        expect(isValidIdentifier("-")).false
        expect(isValidIdentifier("+")).false
        expect(isValidIdentifier("/")).false
        expect(isValidIdentifier("|")).false
        expect(isValidIdentifier("$")).true
        expect(isValidIdentifier("A")).true
        expect(isValidIdentifier("$0")).true
    })
    it("ifDefined", () => {
        const abc = undefined
        const def = "def"
        expect(ifDefined(abc, value => value + "+")).toBeUndefined()
        expect(ifDefined(def, value => value + "+")).toBe("def+")
    })
})