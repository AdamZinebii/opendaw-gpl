// noinspection JSUnusedGlobalSymbols

import {Xml} from "@opendaw/lib-xml"

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
    @Xml.Attribute("version", version => version === "1.0")
    readonly version: "1.0" = "1.0"

    @Xml.Element("Application")
    readonly application!: Application

    @Xml.Element("Transport")
    readonly transport?: Transport

    @Xml.Element("Structure")
    readonly structure!: ReadonlyArray<Lane>

    constructor(project: Partial<Project>) {Object.assign(this, project)}
}

export class Application {
    @Xml.Attribute("name")
    readonly name!: string

    @Xml.Attribute("version")
    readonly version!: string

    constructor(application: Application) {Object.assign(this, application)}
}

export class Transport {
    @Xml.Element("Tempo")
    readonly tempo?: RealParameter

    @Xml.Element("TimeSignature")
    readonly timeSignature?: TimeSignatureParameter

    constructor(transport: Partial<Transport>) {Object.assign(this, transport)}
}

export class RealParameter {
    @Xml.Attribute("value")
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit!: Unit

    @Xml.Attribute("min")
    readonly min?: number

    @Xml.Attribute("max")
    readonly max?: number

    constructor(realParameter: Partial<RealParameter>) {Object.assign(this, realParameter)}
}

export class TimeSignatureParameter {
    @Xml.Attribute("nominator")
    readonly nominator?: number

    @Xml.Attribute("denominator")
    readonly denominator?: number

    constructor(timeSignatureParameter: Partial<TimeSignatureParameter>) {Object.assign(this, timeSignatureParameter)}
}

@Xml.ArrayElement("Lane")
export class Lane {
    @Xml.Attribute("id")
    readonly id?: string

    constructor(lane: Partial<Lane>) {Object.assign(this, lane)}
}