// noinspection JSUnusedGlobalSymbols

export class Project {
    version: "1.0" = "1.0"
    application!: Application
    transport?: Transport
    structure: Lane[] = []
    arrangement?: Arrangement

    constructor(data: Partial<Project> = {}) {
        Object.assign(this, data)
    }
}

export class Nameable {
    name?: string
    color?: string
    comment?: string

    constructor(data: Partial<Nameable> = {}) {
        Object.assign(this, data)
    }
}

export class Referenceable extends Nameable {
    id?: string

    constructor(data: Partial<Referenceable> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Parameter extends Referenceable {
    parameterID?: number

    constructor(data: Partial<Parameter> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

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

export class RealParameter extends Parameter {
    value?: number
    unit!: Unit
    min?: number
    max?: number

    constructor(data: Partial<RealParameter> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class TimeSignatureParameter extends Parameter {
    numerator!: number
    denominator!: number

    constructor(data: Partial<TimeSignatureParameter> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Transport {
    tempo?: RealParameter // FIXME This will render to <RealParameter .../> and not <Tempo .../>.
    timeSignature?: TimeSignatureParameter

    constructor(data: Partial<Transport> = {}) {
        Object.assign(this, data)
    }
}

export class Application {
    name!: string
    version!: string

    constructor(data: Partial<Application> = {}) {
        Object.assign(this, data)
    }
}

export class Lane extends Referenceable {
    constructor(data: Partial<Lane> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Arrangement extends Referenceable {
    timeSignatureAutomation?: Points
    tempoAutomation?: Points
    transportMarkers?: Markers
    lanes?: Lanes

    constructor(data: Partial<Arrangement> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Timeline extends Referenceable {
    track?: Track
    timeUnit?: TimeUnit

    constructor(data: Partial<Timeline> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Points extends Timeline {
    target!: AutomationTarget
    points: Point[] = []

    constructor(data: Partial<Points> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Markers extends Timeline {
    markers: Marker[] = []

    constructor(data: Partial<Markers> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Lanes extends Timeline {
    lanes: Timeline[] = []

    constructor(data: Partial<Lanes> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Point {
    time!: number

    constructor(data: Partial<Point> = {}) {
        Object.assign(this, data)
    }
}

export class AutomationTarget {
    parameter?: Parameter
    expression?: ExpressionType
    channel?: number
    key?: number
    controller?: number

    constructor(data: Partial<AutomationTarget> = {}) {
        Object.assign(this, data)
    }
}

export class Marker extends Nameable {
    time!: number

    constructor(data: Partial<Marker> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Track extends Lane {
    constructor(data: Partial<Track> = {}) {
        super(data)
        Object.assign(this, data)
    }
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

export type TimeUnit = "beats" | "seconds"

export class Clip extends Nameable {
    time!: number
    duration?: number
    playStart?: number
    playStop?: number
    loopStart?: number
    loopStop?: number
    timeline?: Timeline
    ref?: Timeline

    constructor(data: Partial<Clip> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Note {
    time!: number
    duration!: number
    channel?: number
    key!: number
    velocity!: number
    releaseVelocity?: number
    expression?: Timeline[]

    constructor(data: Partial<Note> = {}) {
        Object.assign(this, data)
    }
}

export class Clips extends Timeline {
    clips: Clip[] = []

    constructor(data: Partial<Clips> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Notes extends Timeline {
    notes: Note[] = []

    constructor(data: Partial<Notes> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class MediaFile extends Timeline {
    file!: FileReference
    duration!: number

    constructor(data: Partial<MediaFile> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Audio extends MediaFile {
    sampleRate!: number
    channels!: number
    algorithm?: string

    constructor(data: Partial<Audio> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Warp {
    time!: number
    contentTime!: number

    constructor(data: Partial<Warp> = {}) {
        Object.assign(this, data)
    }
}

export class Warps extends Timeline {
    warps: Warp[] = []

    constructor(data: Partial<Warps> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class FileReference {
    path!: string
    external?: boolean

    constructor(data: Partial<FileReference> = {}) {
        Object.assign(this, data)
    }
}

export class RealPoint extends Point {
    value!: number
    interpolation?: Interpolation

    constructor(data: Partial<RealPoint> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class IntegerPoint extends Point {
    value!: number

    constructor(data: Partial<IntegerPoint> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class EnumPoint extends Point {
    value!: string

    constructor(data: Partial<EnumPoint> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class BoolPoint extends Point {
    value!: boolean

    constructor(data: Partial<BoolPoint> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class TimeSignaturePoint extends Point {
    numerator!: number
    denominator!: number

    constructor(data: Partial<TimeSignaturePoint> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class Video extends MediaFile {
    width!: number
    height!: number
    frameRate!: number
    codec?: string

    constructor(data: Partial<Video> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export class ClipSlot extends Timeline {
    clip?: Clip

    constructor(data: Partial<ClipSlot> = {}) {
        super(data)
        Object.assign(this, data)
    }
}

export enum Interpolation {
    HOLD = "hold",
    LINEAR = "linear"
}