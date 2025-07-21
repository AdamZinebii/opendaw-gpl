// noinspection JSUnusedGlobalSymbols

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

export enum ExpressionType {
    PAN = "pan",
    GAIN = "gain",
    PITCH = "pitch",
    TIMBRE = "timbre",
    PRESSURE = "pressure",
    POLY_PRESSURE = "polyPressure",
    CC = "cc"
}

export enum Interpolation {
    HOLD = "hold",
    LINEAR = "linear"
}

export type TimeUnit = "beats" | "seconds"

export type Nameable = {
    readonly name?: string
    readonly color?: string
    readonly comment?: string
}

export type Referenceable = {
    readonly id: string
}

export abstract class Node<T extends Record<string, any>> {
    protected constructor(readonly tag: string, attributes: Partial<T>) {
        console.debug(`Node(${tag})`, attributes)
        Object.assign(this, attributes)
        console.debug("ENDs with", this)
    }
}

export class ParentNode<T> extends Node<ParentNode<T>> {
    readonly children: ReadonlyArray<Node<{}>>

    constructor(tag: string, attr: Partial<T> = {}, ...children: ReadonlyArray<Node<{}>>) {
        super(tag, attr)

        this.children = children
    }
}

//-------------------------------------------------------------------------------------------------------------------//
//-------------------------------------------------------------------------------------------------------------------//
//-------------------------------------------------------------------------------------------------------------------//

export class Project extends Node<Project> {
    readonly version: "1.0" = "1.0"
    readonly application!: Application
    readonly transport?: Transport
    readonly structure!: ParentNode<Lane>
    readonly arrangement?: Arrangement

    constructor(attributes: Partial<Project> = {}) {super("Project", attributes)}
}

export class Parameter<T extends Record<string, any>> extends Node<T> implements Referenceable {
    readonly id!: string
    readonly parameterID?: number

    constructor(tag: string, attributes: Partial<T> = {}) {
        console.debug(`Parameter(${tag})`, attributes)
        super(tag, attributes)
    }
}

export class RealParameter extends Parameter<RealParameter> {
    readonly value?: number
    readonly unit!: Unit
    readonly min?: number
    readonly max?: number

    constructor(tag: string, attributes: Partial<RealParameter> = {}) {
        console.debug(`RealParameter(${tag})`, attributes)
        super(tag, attributes)
    }
}

export class TimeSignatureParameter extends Parameter<TimeSignatureParameter> {
    readonly numerator!: number
    readonly denominator!: number

    constructor(attributes: Partial<TimeSignatureParameter> = {}) {super("TimeSignature", attributes)}
}

export class Application extends Node<Application> {
    readonly name!: string
    readonly version!: string

    constructor(attributes: Partial<Application> = {}) {super("Application", attributes)}
}

export class Transport extends Node<Transport> {
    readonly tempo?: RealParameter
    readonly timeSignature?: TimeSignatureParameter

    constructor(attributes: Partial<Transport> = {}) {
        super("Transport", attributes)
        console.debug("->", attributes)
    }
}

//--------------------------------------------------------------------------------------------------------------------//
//--------------------------------------------------------------------------------------------------------------------//
//--------------------------------------------------------------------------------------------------------------------//
//--------------------------------------------------------------------------------------------------------------------//

export type Lane = Nameable & Referenceable

export class Arrangement extends Node<Arrangement> implements Referenceable {
    readonly id!: string
    readonly timeSignatureAutomation?: Points
    readonly tempoAutomation?: Points
    readonly transportMarkers?: Markers
    readonly lanes?: Lanes

    constructor(attributes: Partial<Arrangement> = {}) {
        super("Arrangement", attributes)
    }
}

export class Timeline extends Node<Timeline> implements Referenceable {
    readonly id!: string
    readonly track?: Track
    readonly timeUnit?: TimeUnit

    constructor(attributes: Partial<Timeline> = {}) {
        super("Timeline", attributes)
    }
}

export class Points extends Node<Timeline> {
    readonly target!: AutomationTarget
    readonly points: Point[] = []

    constructor(attributes: Partial<Points> = {}) {
        super("Points", attributes)
    }
}

export class Point extends Node<Point> {
    readonly time!: number

    constructor(attributes: Partial<Point> = {}) {
        super("Point", attributes)
    }
}

export class AutomationTarget extends Node<AutomationTarget> {
    readonly parameter?: Parameter<any>
    readonly expression?: ExpressionType
    readonly channel?: number
    readonly key?: number
    readonly controller?: number

    constructor(attributes: Partial<AutomationTarget> = {}) {super("AutomationTarget", attributes)}
}

export class Lanes extends Node<Timeline> {
    readonly lanes!: ParentNode<Timeline>

    constructor(attributes: Partial<Lanes> = {}) {
        super("Lanes", attributes)
    }
}

export class Track extends Node<Track> implements Lane {
    readonly contentType?: "audio" | "automation" | "notes" | "video" | "markers" | "tracks"
    readonly id!: string
    readonly loaded?: boolean

    constructor(attributes: Partial<Track> = {}) {super("Track", attributes)}
}

export class Markers extends Node<Markers> {
    readonly markers: Marker[] = []

    constructor(attributes: Partial<Markers> = {}) {
        super("Markers", attributes)
    }
}

export class Marker extends Node<Marker> implements Nameable {
    readonly name?: string
    readonly color?: string
    readonly comment?: string
    readonly time!: number

    constructor(attributes: Partial<Marker> = {}) {super("Marker", attributes)}
}

/*


export class Marker implements Nameable {
    readonly tag: string = "Marker"
    readonly time!: number

    constructor(attributes: Partial<Marker> = {}) {
        Object.assign(this, attributes)
    }
}



export class Clip implements Nameable {
    readonly tag: string = "Clip"
    readonly time!: number
    readonly duration?: number
    readonly playStart?: number
    readonly playStop?: number
    readonly loopStart?: number
    readonly loopStop?: number
    readonly timeline?: Timeline
    readonly ref?: Timeline

    constructor(attributes: Partial<Clip> = {}) {
        Object.assign(this, attributes)
    }
}

export class Clips extends Timeline implements Node {
    readonly tag: string = "Clips"
    readonly clips: Clip[] = []

    constructor(attributes: Partial<Clips> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class Note implements Node {
    readonly tag: string = "Note"
    readonly time!: number
    readonly duration!: number
    readonly channel?: number
    readonly key!: number
    readonly velocity!: number
    readonly releaseVelocity?: number
    readonly expression?: Timeline[]

    constructor(attributes: Partial<Note> = {}) {
        Object.assign(this, attributes)
    }
}

export class Notes extends Timeline implements Node {
    readonly tag: string = "Notes"
    readonly notes!: ParentNode<Note>

    constructor(attributes: Partial<Notes> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class MediaFile extends Timeline implements Node {
    readonly tag: string = "MediaFile"
    readonly file!: FileReference
    readonly duration!: number

    constructor(attributes: Partial<MediaFile> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class Audio extends MediaFile implements Node {
    readonly tag: string = "Audio"
    readonly sampleRate!: number
    readonly channels!: number
    readonly algorithm?: string

    constructor(attributes: Partial<Audio> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class Warp implements Node {
    readonly tag: string = "Warp"
    readonly time!: number
    readonly contentTime!: number

    constructor(attributes: Partial<Warp> = {}) {
        Object.assign(this, attributes)
    }
}

export class Warps extends Timeline implements Node {
    readonly tag: string = "Warps"
    readonly warps!: ParentNode<Warp>

    constructor(attributes: Partial<Warps>) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class FileReference implements Node {
    readonly tag: string = "FileReference"
    readonly path!: string
    readonly external?: boolean

    constructor(attributes: Partial<FileReference> = {}) {
        Object.assign(this, attributes)
    }
}

export class RealPoint extends Point implements Node {
    readonly tag: string = "RealPoint"
    readonly value!: number
    readonly interpolation?: Interpolation

    constructor(attributes: Partial<RealPoint> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class IntegerPoint extends Point implements Node {
    readonly tag: string = "IntegerPoint"
    readonly value!: number

    constructor(attributes: Partial<IntegerPoint> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class EnumPoint extends Point {
    value!: string

    constructor(attributes: Partial<EnumPoint> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class BoolPoint extends Point {
    value!: boolean

    constructor(attributes: Partial<BoolPoint> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class TimeSignaturePoint extends Point {
    numerator!: number
    denominator!: number

    constructor(attributes: Partial<TimeSignaturePoint> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class Video extends MediaFile {
    width!: number
    height!: number
    frameRate!: number
    codec?: string

    constructor(attributes: Partial<Video> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}

export class ClipSlot extends Timeline {
    clip?: Clip

    constructor(attributes: Partial<ClipSlot> = {}) {
        super(attributes)
        Object.assign(this, attributes)
    }
}*/
