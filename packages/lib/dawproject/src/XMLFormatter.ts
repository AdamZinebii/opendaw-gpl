import {int} from "@opendaw/lib-std"

export class XMLFormatter {
    static format(element: Element): string {
        return this.#formatXMLString(new XMLSerializer().serializeToString(element))
    }

    static #formatXMLString(xml: string): string {
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
}