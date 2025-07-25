import {asDefined, assert, Class, int, isDefined, Nullish, panic, WeakMaps} from "@opendaw/lib-std"

export namespace Xml {
    type Meta =
        | { type: "class", name: string, clazz: Class }
        | { type: "element", name: string, clazz: Class }
        | { type: "element-ref", clazz: Class, name: string | null }
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

    export const BoolRequired: AttributeValidator<boolean> = {
        required: true,
        parse: value => value?.toLowerCase() === "true"
    }
    export const BoolOptional: AttributeValidator<boolean> = {
        required: false,
        parse: value => value?.toLowerCase() === "true"
    }

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

    export const ElementRef = (clazz: Class, wrapperName?: string): PropertyDecorator =>
        (target: Object, propertyKey: PropertyKey) =>
            WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
                .set(propertyKey, {type: "element-ref", clazz, name: wrapperName ?? null})

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
                            const tagMeta = resolveMeta(item.constructor, "class")
                            if (!tagMeta || tagMeta.type !== "class") {
                                return panic(`Missing or invalid @Xml.Class decorator for ${item.constructor.name}`)
                            }
                            return visit(tagMeta.name, item)
                        }))
                        element.appendChild(elements)
                    } else if (typeof value === "string") {
                        const child = doc.createElement(meta.name)
                        child.textContent = value
                        element.appendChild(child)
                    } else {
                        element.appendChild(visit(meta.name, value))
                    }
                } else if (meta.type === "element-ref") {
                    if (!Array.isArray(value)) {return panic("ElementRef must be an array of items.")}
                    const wrapper = meta.name
                        ? doc.createElement(meta.name)
                        : element
                    for (const item of value) {
                        const itemClass = item?.constructor
                        const tagMeta = resolveMeta(itemClass, "class")
                        if (!isDefined(tagMeta) || tagMeta.type !== "class") {
                            return panic(`Missing @Xml.Class decorator on ${itemClass?.name}`)
                        }
                        const childElement = visit(tagMeta.name, item)
                        wrapper.appendChild(childElement)
                    }
                    if (wrapper !== element) {
                        element.appendChild(wrapper)
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
        const metaMap: MetaMap = new Map<PropertyKey, Meta>()
        while (isDefined(target)) {
            const meta = MetaClassMap.get(target)
            if (isDefined(meta)) {
                for (const [key, value] of meta.entries()) {
                    metaMap.set(key, value)
                }
            }
            target = Object.getPrototypeOf(target)
        }
        return metaMap.size > 0 ? metaMap : undefined
    }

    export const parse = <T extends {}>(xml: string, clazz: Class<T>): T => {
        const deserialize = <T extends {}>(element: Element, clazz: Class<unknown>): T => {
            const instance = Object.create(clazz.prototype) as T
            const classMeta = asDefined(Xml.collectMeta(clazz))
            const classMetaDict: Record<keyof T, Meta> = Array.from(classMeta).reduce((acc: any, [key, metaInfo]) => {
                acc[key] = metaInfo
                return acc
            }, {})
            const keys = [...classMeta.keys()].filter(key => key !== "class") as Array<keyof T>
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
                        Object.defineProperty(instance, key, {value: undefined, enumerable: true})
                    }
                } else if (meta.type === "element") {
                    const {name, clazz: elementClazz} = meta
                    if (elementClazz === Array) {
                        const arrayElements = element.querySelectorAll(`:scope > ${name}`)
                        const items = Array.from(arrayElements).map(child =>
                            deserialize(child, asDefined(ClassMap.get(child.nodeName),
                                `Could not find class for '${child.nodeName}'`)))
                        Object.defineProperty(instance, key, {
                            value: items,
                            enumerable: true
                        })
                    } else if (elementClazz === String) {
                        const textContent = element.querySelector(`:scope > ${name}`)?.textContent
                        Object.defineProperty(instance, key, {
                            value: textContent,
                            enumerable: true
                        })
                    } else {
                        const child = element.querySelector(`:scope > ${name}`)
                        if (isDefined(child)) {
                            Object.defineProperty(instance, key, {
                                value: deserialize(child, elementClazz),
                                enumerable: true
                            })
                        } else {
                            Object.defineProperty(instance, key, {value: undefined, enumerable: true})
                        }
                    }
                } else if (meta.type === "element-ref") {
                    const parent = isDefined(meta.name)
                        ? element.querySelector(`:scope > ${meta.name}`)
                        : element
                    if (isDefined(parent)) {
                        Object.defineProperty(instance, key, {
                            value: Array.from(parent.children).map(child => {
                                const clazz = asDefined(ClassMap.get(child.nodeName))
                                if (!(clazz === meta.clazz || clazz.prototype instanceof meta.clazz)) {
                                    return null
                                }
                                return deserialize(child, clazz)
                            }).filter(isDefined),
                            enumerable: true
                        })
                    } else {
                        Object.defineProperty(instance, key, {value: undefined, enumerable: true})
                    }
                }
            }
            return instance
        }
        const xmlDoc = new DOMParser().parseFromString(xml.trimStart(), "application/xml").documentElement
        return deserialize(xmlDoc, clazz)
    }
}