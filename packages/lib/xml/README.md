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
```

### Example

```typescript
const project = new Project({
    application: new Application({name: "openDAW", version: "0.1"}),
    transport: new Transport({
        tempo: new RealParameter({unit: Unit.BPM, value: 120}),
        timeSignature: new TimeSignatureParameter({nominator: 4, denominator: 4})
    }),
    structure: [
        new Lane({id: "0"}),
        new Lane({id: "1"})
    ]
})
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