// noinspection JSUnusedGlobalSymbols

import {isDefined, Nullish, panic, Predicate, WeakMaps} from "@opendaw/lib-std"

//--- DECORATORS ---//

type Meta =
    |({ type: "element" | "class" }
    | { type: "attribute", name: string, validator?: Predicate<any> }) & { name: string }
type PropertyKey = string | symbol
type MetaMap = Map<PropertyKey, Meta>
const MetaClassMap = new WeakMap<Function, MetaMap>()
const resolveMeta = (target: Function, propertyKey: PropertyKey): Nullish<Meta> =>
    MetaClassMap.get(target)?.get(propertyKey)

export const XmlAttribute = (name: string, validator?: Predicate<any>): PropertyDecorator =>
    (target: Object, propertyKey: PropertyKey): void => {
        WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
            .set(propertyKey, {type: "attribute", name, validator})
    }

export const XmlElement = (name: string): PropertyDecorator =>
    (target: Object, propertyKey: PropertyKey): void => {
        WeakMaps.createIfAbsent(MetaClassMap, target.constructor, () => new Map<PropertyKey, Meta>())
            .set(propertyKey, {type: "element", name})
    }

export const XmlArrayElement = (name: string): ClassDecorator =>
    (constructor: Function): void => {
        WeakMaps.createIfAbsent(MetaClassMap, constructor, () => new Map<PropertyKey, Meta>())
            .set("class", {type: "class", name})
    }

//--- ENUMS ---//

export enum Unit {
    LINEAR = "linear",
    NORMALIZED = "normalized",
    PERCENT = "percent",
    DECIBEL = "decibel",
    HERTZ = "hertz",
    SEMITONES = "semitones",
    SECONDS = "seconds",
    BEATS = "beats",
    BPM = "bpm"
}

//--- CLASSES ---//

export class Project {
    @XmlAttribute("version", version => version === "1.0")
    readonly version: "1.0" = "1.0"

    @XmlElement("Application")
    readonly application: Application

    @XmlElement("Transport")
    readonly transport?: Transport

    @XmlElement("Structure")
    readonly structure: ReadonlyArray<Lane>

    constructor({application, transport, structure}: {
        application: Application
        transport?: Transport
        structure: ReadonlyArray<Lane>
    }) {
        this.application = application
        this.transport = transport
        this.structure = structure
    }

    toXML(): Element {
        const doc = document.implementation.createDocument(null, null)
        const visit = (tag: string, object: Record<string, any>): Element => {
            const element = doc.createElement(tag)
            Object.entries(object).forEach(([key, value]) => {
                if (!isDefined(value)) {return}
                const meta = resolveMeta(object.constructor, key)
                if (!isDefined(meta)) {return}
                if (meta.type === "attribute") {
                    if (meta.validator?.call(null, value) === false) {
                        return panic(`Attribute validator failed for ${key} = ${value}`)
                    }
                    element.setAttribute(meta.name, value)
                } else if (meta.type === "element") {
                    if (Array.isArray(value)) {
                        const elements = doc.createElement(meta.name)
                        elements.append(...value.map(item => {
                            const tag = resolveMeta(item.constructor, "class")?.name
                                ?? item.constructor.name
                            return visit(tag, item)
                        }))
                        element.appendChild(elements)
                    } else {
                        element.appendChild(visit(meta.name, value))
                    }
                }
            })
            return element
        }
        return visit("Project", this)
    }
}

export class Application {
    @XmlAttribute("name")
    readonly name: string

    @XmlAttribute("version")
    readonly version: string

    constructor(name: string, version: string) {
        this.name = name
        this.version = version
    }
}

export class Transport {
    @XmlElement("Tempo")
    readonly tempo?: RealParameter

    @XmlElement("TimeSignature")
    readonly timeSignature?: TimeSignatureParameter

    constructor({tempo, timeSignature}: { tempo?: RealParameter, timeSignature?: TimeSignatureParameter }) {
        this.tempo = tempo
        this.timeSignature = timeSignature
    }
}

export class RealParameter {
    @XmlAttribute("value")
    readonly value?: number

    @XmlAttribute("unit")
    readonly unit!: Unit

    @XmlAttribute("min")
    readonly min?: number

    @XmlAttribute("max")
    readonly max?: number

    constructor({unit, value, min, max}: { unit: Unit, value?: number, min?: number, max?: number }) {
        this.value = value
        this.unit = unit
        this.min = min
        this.max = max
    }
}

export class TimeSignatureParameter {
    @XmlAttribute("nominator")
    readonly nominator?: number

    @XmlAttribute("denominator")
    readonly denominator?: number

    constructor({nominator, denominator}: { nominator?: number, denominator?: number }) {
        this.nominator = nominator
        this.denominator = denominator
    }
}

@XmlArrayElement("Lane")
export class Lane {
    @XmlAttribute("id")
    readonly id?: string

    constructor({id}: { id: string }) {
        this.id = id
    }
}