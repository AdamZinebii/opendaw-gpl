import {isDefined, Nullish} from "./lang"

export namespace Strings {
    export const hyphenToCamelCase = (value: string) => value
        .replace(/-([a-z])/g, (g: string) => g[1].toUpperCase())

    export const fallback = (value: Nullish<string>, fallback: string): string =>
        isDefined(value) && value.length > 0 ? value : fallback

    export const endsWithDigit = (str: string): boolean => /\d$/.test(str)

    export const nonEmpty = (str: Nullish<string>, fallback: string): string =>
        isDefined(str) && str.trim().length > 0 ? str : fallback

    // UTF-8
    export const toArrayBuffer = (str: string): ArrayBuffer => {
        const buffer = new ArrayBuffer(str.length)
        const view = new Uint8Array(buffer)
        for (let i = 0; i < str.length; i++) {
            view[i] = str.charCodeAt(i)
        }
        return buffer
    }

    export const getUniqueName = (existingNames: ReadonlyArray<string>, desiredName: string): string => {
        const existingSet = new Set(existingNames)
        let test = desiredName
        let counter = 1
        if (existingSet.has(desiredName) || existingSet.has(`${desiredName} 1`)) {
            counter = 2
        } else {
            return desiredName
        }
        while (existingSet.has(test = `${desiredName} ${counter++}`)) {}
        return test
    }
}