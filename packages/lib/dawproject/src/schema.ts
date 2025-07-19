// noinspection JSUnusedGlobalSymbols

export interface Project {
    version: "1.0"
    application: Application
    transport?: Transport
    structure: Lane[]
    arrangement?: Arrangement
}

export interface Nameable {
    name?: string
    color?: string
    comment?: string
}

export interface Referenceable extends Nameable {
    id?: string
}

export interface Parameter extends Referenceable {
    parameterID?: number
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

export interface RealParameter extends Parameter {
    value?: number
    unit: Unit
    min?: number
    max?: number
}

export interface TimeSignatureParameter extends Parameter {
    numerator: number
    denominator: number
}

export interface Transport {
    tempo?: RealParameter
    timeSignature?: TimeSignatureParameter
}

export interface Application {
    name: string
    version: string
}

export interface Lane extends Referenceable {}

export interface Arrangement extends Referenceable {
    timeSignatureAutomation?: Points
    tempoAutomation?: Points
    transportMarkers?: Markers
    lanes?: Lanes
}

export interface Points extends Timeline {
    target: AutomationTarget
    points: Point[]
}

export interface Markers extends Timeline {
    markers: Marker[]
}

export interface Lanes extends Timeline {
    lanes: Timeline[]
}

export interface Timeline extends Referenceable {
    track?: Track
    timeUnit?: TimeUnit
}

export interface Point {
    time: number
}

export interface AutomationTarget {
    parameter?: Parameter
    expression?: ExpressionType
    channel?: number
    key?: number
    controller?: number
}

export interface Marker extends Nameable {
    time: number
}

export interface Track extends Lane {}

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

export interface Clip extends Nameable {
    time: number
    duration?: number
    playStart?: number
    playStop?: number
    loopStart?: number
    loopStop?: number
    timeline?: Timeline
    ref?: Timeline
}

export interface Note {
    time: number
    duration: number
    channel?: number
    key: number
    velocity: number
    releaseVelocity?: number
    expression?: Timeline[]
}

export interface Clips extends Timeline {
    clips: Clip[]
}

export interface Notes extends Timeline {
    notes: Note[]
}

export interface Audio extends MediaFile {
    sampleRate: number
    channels: number
    algorithm?: string
}

export interface MediaFile extends Timeline {
    file: FileReference
    duration: number
}

export interface Warp {
    time: number
    contentTime: number
}

export interface Warps extends Timeline {
    warps: Warp[]
}

export interface FileReference {
    path: string
    external?: boolean
}

export interface RealPoint extends Point {
    value: number
    interpolation?: Interpolation
}

export interface IntegerPoint extends Point {
    value: number
}

export interface EnumPoint extends Point {
    value: string
}

export interface BoolPoint extends Point {
    value: boolean
}

export interface TimeSignaturePoint extends Point {
    numerator: number
    denominator: number
}

export interface Video extends MediaFile {
    width: number
    height: number
    frameRate: number
    codec?: string
}

export interface ClipSlot extends Timeline {
    clip?: Clip
}

export enum Interpolation {
    HOLD = "hold",
    LINEAR = "linear"
}