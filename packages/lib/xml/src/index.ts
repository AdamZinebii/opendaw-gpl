import {asDefined, assert, Class, int, isDefined, Nullish, panic, WeakMaps} from "@opendaw/lib-std"

export namespace Xml {
    type Meta =
        | { type: "class", name: string, clazz: Class }
        | { type: "element", name: string, clazz: Class }
        | { type: "attribute", name: string, validator?: AttributeValidator<unknown> }
    type MetaMap = Map<PropertyKey, Meta>

    const ClassMap = new Map<string, Class>()
    const MetaClassMap = new WeakMap<Function, MetaMap>()

    export const Declaration = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"

    export interface AttributeValidator<T> {
        required: boolean
        parse(value: string): T
    }

    export const StringRequired: AttributeValidator<string> = {required: true, parse: value => value}
    export const StringOptional: AttributeValidator<string> = {required: false, parse: value => value}

    export const BoolRequired: AttributeValidator<boolean> = {required: true, parse: value => Boolean(value)}
    export const BoolOptional: AttributeValidator<boolean> = {required: false, parse: value => Boolean(value)}

    export const NumberRequired: AttributeValidator<number> = {
        required: true, parse: value => {
            const number = Number(value)
            return isNaN(number) ? panic("NumberRequired") : number
        }
    }
    export const NumberOptional: AttributeValidator<number> = {required: false, parse: value => Number(value)}

    export const Attribute = (name: string, validator?: AttributeValidator<unknown>): PropertyDecorator =>
        (target: Object, propertyKey: PropertyKey) =>
            WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
                .set(propertyKey, {type: "attribute", name, validator})

    export const Element = (name: string, clazz: Class): PropertyDecorator =>
        (target: Object, propertyKey: PropertyKey) =>
            WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
                .set(propertyKey, {type: "element", name, clazz})

    export const Class = (tagName: string): ClassDecorator => {
        return (constructor: Function): void => {
            assert(!ClassMap.has(tagName), `${tagName} is already registered as a class.`)
            ClassMap.set(tagName, constructor)
            WeakMaps.createIfAbsent(MetaClassMap, constructor, () => new Map<PropertyKey, Meta>())
                .set("class", {type: "class", name: tagName, clazz: constructor})
        }
    }

    export const element = <T extends {}>(object: T, clazz: Class<T>): T => {
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
                    meta.validator?.parse?.call(null, value)
                    element.setAttribute(meta.name, String(value))
                } else if (meta.type === "element") {
                    if (Array.isArray(value)) {
                        console.debug("Array")
                        const elements = doc.createElement(meta.name)
                        elements.append(...value.map(item => {
                            const name = resolveMeta(item.constructor, "class")?.name
                            if (!isDefined(name)) {
                                return panic(`Class '${item.constructor.name}' inside an array must have a @Xml.RootElement decorator. key: '${key}'`)
                            }
                            return visit(name, item)
                        }))
                        element.appendChild(elements)
                    } else if (typeof value === "string") {
                        const child = doc.createElement(meta.name)
                        child.textContent = value
                        element.appendChild(child)
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

    export const resolveMeta = (target: Function, propertyKey: PropertyKey): Nullish<Meta> =>
        collectMeta(target)?.get(propertyKey)

    export const collectMeta = (target: Function): Nullish<MetaMap> => {
        while (isDefined(target)) {
            const meta = MetaClassMap.get(target)
            if (isDefined(meta)) {return meta}
            target = Object.getPrototypeOf(target)
        }
        return undefined
    }

    export const parse = <T extends {}>(xml: string, clazz: Class<T>): T => {
        const deserialize = <T extends {}>(element: Element, clazz: Class<unknown>): T => {
            const instance = Object.create(clazz.prototype) as T
            const classMeta = asDefined(Xml.collectMeta(clazz))
            const classMetaDict: Record<keyof T, Meta> = Array.from(classMeta).reduce((acc: any, [key, metaInfo]) => {
                acc[key] = metaInfo
                return acc
            }, {})
            const keys = Reflect.ownKeys(clazz.prototype).filter(key => key !== "constructor") as (keyof T)[]
            for (const key of keys) {
                const meta: Meta = classMetaDict[key]
                if (meta.type === "attribute") {
                    const attribute = element.getAttribute(meta.name)
                    if (isDefined(attribute)) {
                        Object.defineProperty(instance, key, {
                            value: meta.validator?.parse?.call(null, attribute) ?? attribute,
                            enumerable: true
                        })
                    } else {
                        meta.validator?.required && panic(`Missing attribute '${meta.name}'`)
                    }
                } else if (meta.type === "element") {
                    const {name, clazz} = meta
                    if (clazz === Array) {
                        const arrayElement = element.querySelector(name)
                        if (isDefined(arrayElement)) {
                            Object.defineProperty(instance, key, {
                                value: Array.from(arrayElement.children)
                                    .map(child => deserialize(child, asDefined(ClassMap.get(child.nodeName),
                                        `Could not find class for '${child.nodeName}'`))),
                                enumerable: true
                            })
                        }
                    } else if (clazz === String) {
                        const textContent = element.querySelector(`:scope > ${name}`)?.textContent
                        Object.defineProperty(instance, key, {
                            value: textContent,
                            enumerable: true
                        })
                    } else {
                        const child = element.querySelector(`:scope > ${name}`)
                        if (isDefined(child)) {
                            Object.defineProperty(instance, key, {
                                value: deserialize(child, clazz),
                                enumerable: true
                            })
                        }
                    }
                }
            }
            return instance
        }
        return deserialize(new DOMParser()
            .parseFromString(xml.trimStart(), "application/xml").documentElement, clazz)
    }
}