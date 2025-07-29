import {isDefined, unitValue} from "./lang"

export namespace Color {
    export type RGBA = [unitValue, unitValue, unitValue, unitValue]

    export const parseCssRgbOrRgba = (color: string): RGBA => {
        const colorValues = color.match(/\(([^)]+)\)/)?.at(1)?.split(",")?.map(Number)
        if (isDefined(colorValues) && colorValues.every(value => !isNaN(value))) {
            if (colorValues.length === 3) {
                return [
                    colorValues[0] / 255.0,
                    colorValues[1] / 255.0,
                    colorValues[2] / 255.0,
                    1.0
                ]
            } else if (colorValues.length === 4) {
                return [
                    colorValues[0] / 255.0,
                    colorValues[1] / 255.0,
                    colorValues[2] / 255.0,
                    colorValues[3]
                ]
            }
        }
        throw new Error(`${color} is not proper formatted. Example: 'rgb(255, 255, 255)' or 'rgba(255, 255, 255, 1)'`)
    }

    export const hslToHex = (h: number, s: unitValue, l: unitValue): string => {
        const k = (n: number) => (n + h / 30.0) % 12.0
        const a = s * Math.min(l, 1.0 - l)
        const f = (n: number) => l - a * Math.max(-1.0, Math.min(k(n) - 3.0, Math.min(9.0 - k(n), 1.0)))
        const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0")
        return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
    }

    export const hslStringToHex = (hsl: string): string => {
        const [h, s, l] = hsl.match(/\d+(\.\d+)?/g)!.map(Number)
        return hslToHex(h, s / 100.0, l / 100.0)
    }
}