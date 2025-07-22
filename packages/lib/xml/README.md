_This package is part of the openDAW SDK_

# @opendaw/lib-xml

Library to parse and serialize XML with validator in a typed schema.

### Schema

```typescript
import {Xml} from "@opendaw/lib-xml"

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
```

### Example

```typescript
const project = Xml.element({
    application: Xml.element({name: "openDAW", version: "0.1"}, ApplicationSchema),
    transport: Xml.element({
        tempo: Xml.element({unit: Unit.BPM, value: 120}, RealParameterSchema),
        timeSignature: Xml.element({nominator: 4, denominator: 4}, TimeSignatureParameterSchema)
    }, TransportSchema),
    structure: [
        // Element classes in an array must have @Xml.RootElement decorator with an element tag-name 
        Xml.element({id: "0"}, LaneSchema),
        Xml.element({id: "1"}, LaneSchema)
    ]
}, ProjectSchema)

console.debug(Xml.pretty(Xml.toElement("Project", project)))
```

### Result

```xml

<Project version="1.0">
    <Application name="openDAW" version="0.1"/>
    <Transport>
        <Tempo value="120" unit="bpm"/>
        <TimeSignature nominator="4" denominator="4"/>
    </Transport>
    <Structure>
        <Lane id="0"/>
        <Lane id="1"/>
    </Structure>
</Project>
```