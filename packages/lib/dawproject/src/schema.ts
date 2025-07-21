// noinspection JSUnusedGlobalSymbols

import {isDefined, Nullish, WeakMaps} from "@opendaw/lib-std"

//--- DECORATORS ---//

type Meta = { type: "attr" | "element", name: string }
const MetaMap = new WeakMap<Function, Map<string | symbol, Meta>>()
const resolveMeta = (target: Function, propertyKey: string | symbol): Nullish<Meta> => MetaMap.get(target)?.get(propertyKey)

export const Attr = (name: string): PropertyDecorator => (target: Object, propertyKey: string | symbol): void => {
    WeakMaps.createIfAbsent(MetaMap, target.constructor, () => new Map<string | symbol, Meta>()).set(propertyKey, {
        type: "attr",
        name
    })
}

export const Element = (name: string): PropertyDecorator => (target: Object, propertyKey: string | symbol): void => {
    WeakMaps.createIfAbsent(MetaMap, target.constructor, () => new Map<string | symbol, Meta>()).set(propertyKey, {
        type: "element",
        name
    })
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
    @Attr("version")
    readonly version: "1.0" = "1.0"

    @Element("Application")
    readonly application: Application

    @Element("Transport")
    readonly transport?: Transport

    constructor({application, transport}: {
        application: Application
        transport?: Transport
    }) {
        this.application = application
        this.transport = transport
    }

    toXML(): Element {
        const doc = document.implementation.createDocument(null, null)
        const visit = (tag: string, object: Record<string, any>): Element => {
            const element = doc.createElement(tag)
            Object.entries(object).forEach(([key, value]) => {
                if (!isDefined(value)) {return}
                const meta = resolveMeta(object.constructor, key)
                if (!isDefined(meta)) {return}
                switch (meta.type) {
                    case "attr": {
                        element.setAttribute(meta.name, value)
                        return
                    }
                    case "element": {
                        element.appendChild(visit(meta.name, value))
                        return
                    }
                }
            })
            return element
        }
        return visit("Project", this)
    }
}

export class Application {
    @Attr("name")
    readonly name: string

    @Attr("version")
    readonly version: string

    constructor(name: string, version: string) {
        this.name = name
        this.version = version
    }
}

export class Transport {
    @Element("Tempo")
    readonly tempo?: RealParameter

    @Element("TimeSignature")
    readonly timeSignature?: TimeSignatureParameter

    constructor({tempo, timeSignature}: { tempo?: RealParameter, timeSignature?: TimeSignatureParameter }) {
        this.tempo = tempo
        this.timeSignature = timeSignature
    }
}

export class RealParameter {
    @Attr("value")
    readonly value?: number

    @Attr("unit")
    readonly unit!: Unit

    @Attr("min")
    readonly min?: number

    @Attr("max")
    readonly max?: number

    constructor({unit, value, min, max}: { unit: Unit, value?: number, min?: number, max?: number }) {
        this.value = value
        this.unit = unit
        this.min = min
        this.max = max
    }
}

export class TimeSignatureParameter {
    @Attr("nominator")
    readonly nominator?: number

    @Attr("denominator")
    readonly denominator?: number

    constructor({nominator, denominator}: { nominator?: number, denominator?: number }) {
        this.nominator = nominator
        this.denominator = denominator
    }
}