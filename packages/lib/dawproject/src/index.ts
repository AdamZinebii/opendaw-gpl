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

export class ProjectSchema {
    @Xml.Attribute("version", version => version === "1.0")
    readonly version: "1.0" = "1.0"

    @Xml.Element("Application")
    readonly application!: ApplicationSchema

    @Xml.Element("Transport")
    readonly transport?: TransportSchema

    @Xml.Element("Structure")
    readonly structure!: ReadonlyArray<LaneSchema>
}

export class ApplicationSchema {
    @Xml.Attribute("name")
    readonly name!: string

    @Xml.Attribute("version")
    readonly version!: string
}

export class TransportSchema {
    @Xml.Element("Tempo")
    readonly tempo?: RealParameterSchema

    @Xml.Element("TimeSignature")
    readonly timeSignature?: TimeSignatureParameterSchema
}

export class RealParameterSchema {
    @Xml.Attribute("value")
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit!: Unit

    @Xml.Attribute("min")
    readonly min?: number

    @Xml.Attribute("max")
    readonly max?: number
}

export class TimeSignatureParameterSchema {
    @Xml.Attribute("nominator")
    readonly nominator?: number

    @Xml.Attribute("denominator")
    readonly denominator?: number
}

@Xml.RootElement("Lane")
export class LaneSchema {
    @Xml.Attribute("id")
    readonly id?: string
}