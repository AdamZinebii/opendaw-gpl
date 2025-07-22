import {assert, Class, int, isDefined, Nullish, panic, Predicate, WeakMaps} from "@opendaw/lib-std"

type Meta =
    |({ type: "element" | "class" }
    | { type: "attribute", name: string, validator?: Predicate<unknown> }) & { name: string }
type MetaMap = Map<PropertyKey, Meta>

const MetaClassMap = new WeakMap<Function, MetaMap>()

export namespace Xml {
    export const Attribute = (name: string, validator?: Predicate<unknown>): PropertyDecorator =>
        (target: Object, propertyKey: PropertyKey) =>
            WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
                .set(propertyKey, {type: "attribute", name, validator})

    export const Element = (tagName: string): PropertyDecorator =>
        (target: Object, propertyKey: PropertyKey) =>
            WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
                .set(propertyKey, {type: "element", name: tagName})

    export const RootElement = (tagName: string): ClassDecorator =>
        (constructor: Function): void => {
            WeakMaps.createIfAbsent(MetaClassMap, constructor, () => new Map<PropertyKey, Meta>())
                .set("class", {type: "class", name: tagName})
        }

    export const element = <T extends {}>(object: Partial<T>, clazz: Class<T>): T => {
        assert(clazz.length === 0, "constructor cannot have arguments")
        return Object.freeze(Object.create(clazz.prototype, Object.fromEntries(
            Object.entries(object).map(([key, value]) => [key, {value, enumerable: true}]))))
    }

    export const toElement = (tagName: string, object: Record<string, any>): Element => {
        const doc = document.implementation.createDocument(null, null)
        const visit = (tagName: string, object: Record<string, any>): Element => {
            const element = doc.createElement(tagName)
            Object.entries(object).forEach(([key, value]) => {
                if (!isDefined(value)) {return}
                if (key === "children" && Array.isArray(value)) {
                    element.append(...value.map(item => {
                        const name = resolveMeta(item.constructor, "class")?.name
                        if (!isDefined(name)) {
                            return panic("Classes inside an array must have a @Xml.RootElement decorator")
                        }
                        return visit(name, item)
                    }))
                    return
                }
                const meta = resolveMeta(object.constructor, key)
                if (!isDefined(meta)) {return}
                if (meta.type === "attribute") {
                    assert(typeof value === "number" || typeof value === "string" || typeof value === "boolean",
                        `Attribute value must be a primitive for ${key} = ${value}`)
                    if (meta.validator?.call(null, value) === false) {
                        return panic(`Attribute validator failed for ${key} = ${value}`)
                    }
                    element.setAttribute(meta.name, String(value))
                } else if (meta.type === "element") {
                    if (Array.isArray(value)) {
                        const elements = doc.createElement(meta.name)
                        elements.append(...value.map(item => {
                            const name = resolveMeta(item.constructor, "class")?.name
                            if (!isDefined(name)) {
                                return panic("Classes inside an array must have a @Xml.RootElement decorator")
                            }
                            return visit(name, item)
                        }))
                        element.appendChild(elements)
                    } else {
                        element.appendChild(visit(meta.name, value))
                    }
                } else {
                    return panic(`Unknown meta type ${meta.type}`)
                }
            })
            return element
        }
        return visit(tagName, object)
    }

    export const pretty = (element: Element): string => {
        const PADDING = "  " // 2 spaces
        const reg = /(>)(<)(\/*)/g
        const xml = new XMLSerializer()
            .serializeToString(element)
            .replace(reg, "$1\n$2$3")
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

    const resolveMeta = (target: Function, propertyKey: PropertyKey): Nullish<Meta> => {
        while (isDefined(target)) {
            const meta = MetaClassMap.get(target)?.get(propertyKey)
            if (isDefined(meta)) {return meta}
            target = Object.getPrototypeOf(target)
        }
        return undefined
    }
}