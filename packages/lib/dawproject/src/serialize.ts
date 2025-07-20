import {int, panic} from "@opendaw/lib-std"

export class Serializer {
    static pretty(element: Element): string {
        const serializer = new XMLSerializer()
        const xmlString = serializer.serializeToString(element)
        return this.#formatXML(xmlString)
    }

    static #formatXML(xml: string): string {
        const PADDING = "  " // 2 spaces
        const reg = /(>)(<)(\/*)/g
        xml = xml.replace(reg, "$1\n$2$3")
        let pad: int = 0
        return xml.split("\n").map(line => {
            let indent: int = 0
            if (line.match(/.+<\/\w[^>]*>$/)) {
                indent = 0
            } else if (line.match(/^<\/\w/) && pad > 0) {
                pad -= 1
            } else if (line.match(/^<\w[^>]*[^\/]>.*$/)) {
                indent = 1
            } else {
                indent = 0
            }
            const padding = PADDING.repeat(pad)
            pad += indent
            return padding + line
        }).join("\n")
    }

    readonly #doc: Document

    constructor() {
        this.#doc = document.implementation.createDocument(null, "Project", null)
    }

    toXML<T extends { constructor: Function } & Record<string, any>>(object: T): Element {
        const element = this.#doc.createElement(object.constructor.name)
        for (const [key, value] of Object.entries(object)) {
            if (value === null || value === undefined) {
                // We do not write them out
            } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                element.setAttribute(key, String(value))
            } else if (Array.isArray(value)) {
                value.forEach(v => element.appendChild(this.toXML(v)))
            } else if (typeof value === "object") {
                element.appendChild(this.toXML(value))
            } else {
                return panic(`Cannot serialize ${value}`)
            }
        }
        return element
    }
}