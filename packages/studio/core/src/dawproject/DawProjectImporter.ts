import {
    AudioSchema,
    ClipSchema,
    ClipsSchema,
    LaneSchema,
    LanesSchema,
    NotesSchema,
    ProjectSchema,
    TimelineSchema,
    TrackSchema,
    WarpsSchema
} from "@opendaw/lib-dawproject"
import {asDefined, int, isInstanceOf, isUndefined, Nullish, Option, panic, UUID} from "@opendaw/lib-std"
import {DawProjectIO} from "./DawProjectIO"
import {
    AudioBusBox,
    AudioUnitBox,
    BoxIO,
    GrooveShuffleBox,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    RootBox,
    TimelineBox,
    TrackBox,
    UserInterfaceBox
} from "@opendaw/studio-boxes"
import {BoxGraph} from "@opendaw/lib-box"
import {PPQN} from "@opendaw/lib-dsp"
import {IconSymbol, ProjectDecoder, TrackType} from "@opendaw/studio-adapters"
import {AudioUnitType} from "@opendaw/studio-enums"
import {InstrumentFactories} from "../InstrumentFactories"

/**
 * Collecting notes:
 *
 * The intense nesting is very cumbersome to work with.
 * Almost everything in dawproject is a timeline, even audio.
 */
export class DawProjectImporter {
    readonly #schema: ProjectSchema
    readonly #samples: DawProjectIO.Samples

    readonly #mapTrackBoxes: Map<string, TrackBox>

    readonly #boxGraph: BoxGraph<BoxIO.TypeMap>
    readonly #rootBox: RootBox
    readonly #masterBusBox: AudioBusBox
    readonly #masterAudioUnit: AudioUnitBox
    readonly #timelineBox: TimelineBox
    readonly #userInterfaceBox: UserInterfaceBox

    constructor(schema: ProjectSchema, samples: DawProjectIO.Samples) {
        this.#schema = schema
        this.#samples = samples

        this.#mapTrackBoxes = new Map<string, TrackBox>()

        const isoString = new Date().toISOString()
        console.debug(`New Project imported on ${isoString}`)

        this.#boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        this.#boxGraph.beginTransaction()

        const grooveShuffleBox = GrooveShuffleBox.create(this.#boxGraph, UUID.generate(), box => {
            box.label.setValue("Groove Shuffle")
        })

        this.#timelineBox = TimelineBox.create(this.#boxGraph, UUID.generate())
        this.#rootBox = RootBox.create(this.#boxGraph, UUID.generate(), box => {
            box.groove.refer(grooveShuffleBox)
            box.created.setValue(isoString)
            box.timeline.refer(this.#timelineBox.root)
        })

        this.#masterBusBox = AudioBusBox.create(this.#boxGraph, UUID.generate(), box => {
            box.collection.refer(this.#rootBox.audioBusses)
            box.label.setValue("Output")
            box.icon.setValue(IconSymbol.toName(IconSymbol.SpeakerHeadphone))
            box.color.setValue(/*Colors.blue*/ "hsl(189, 100%, 65%)") // TODO
        })
        this.#masterAudioUnit = AudioUnitBox.create(this.#boxGraph, UUID.generate(), box => {
            box.type.setValue(AudioUnitType.Output)
            box.collection.refer(this.#rootBox.audioUnits)
            box.output.refer(this.#rootBox.outputDevice)
            box.index.setValue(0)
        })

        this.#masterBusBox.output.refer(this.#masterAudioUnit.input)
        this.#userInterfaceBox = UserInterfaceBox.create(this.#boxGraph, UUID.generate(),
            box => box.root.refer(this.#rootBox.users))

        this.#readTransport()
        this.#readStructure()
        this.#readArrangement()
        this.#boxGraph.endTransaction()
        this.#boxGraph.verifyPointers()
    }

    get skeleton(): ProjectDecoder.Skeleton {
        return {
            boxGraph: this.#boxGraph,
            mandatoryBoxes: {
                rootBox: this.#rootBox,
                timelineBox: this.#timelineBox,
                masterBusBox: this.#masterBusBox,
                masterAudioUnit: this.#masterAudioUnit,
                userInterfaceBox: this.#userInterfaceBox
            }
        }
    }

    #readTransport(): void {
        const {transport} = this.#schema

        if (isUndefined(transport)) {return}
        this.#timelineBox.bpm.setValue(transport.tempo?.value ?? 120.0)
        this.#timelineBox.signature.nominator.setValue(transport.timeSignature?.numerator ?? 4)
        this.#timelineBox.signature.denominator.setValue(transport.timeSignature?.denominator ?? 4)
    }

    #readStructure(): void {
        const {structure} = this.#schema
        structure.forEach((lane: LaneSchema, index: int) => {
            if (isInstanceOf(lane, TrackSchema)) {
                const channel = asDefined(lane.channel, "Track has no Channel")
                if (channel.role === "regular") {
                    const audioUnitBox = AudioUnitBox.create(this.#boxGraph, UUID.generate(), box => {
                        box.index.setValue(index)
                        box.type.setValue(AudioUnitType.Instrument)
                        box.output.refer(this.#masterBusBox.input)
                        box.collection.refer(this.#rootBox.audioUnits)
                    })
                    const trackBox = TrackBox.create(this.#boxGraph, UUID.generate(), box => {
                        box.type.setValue(this.#contentToTrackType(lane.contentType))
                        box.index.setValue(0)
                        box.tracks.refer(audioUnitBox.tracks)
                        box.target.refer(audioUnitBox)
                    })
                    this.#mapTrackBoxes.set(asDefined(lane.id, "Track must have an id."), trackBox)
                    InstrumentFactories.Vaporisateur
                        .create(this.#boxGraph, audioUnitBox.input, lane.name ?? "", IconSymbol.Piano)
                } else if (channel.role === "effect") {
                    // TODO
                } else if (channel.role === "master") {
                    // TODO
                } else {
                    return panic(`Unknown channel role: ${channel.role}`)
                }
            }
        })
    }

    #readArrangement(): void {
        const {arrangement} = this.#schema

        const readRegions = ({clips}: ClipsSchema, track: string): void =>
            clips.forEach(clip => readAnyRegion(clip, track))

        const readLane = (lane: LanesSchema): void => {
            const track = lane.track // links to track in structure
            lane?.lanes?.filter(timeline => isInstanceOf(timeline, ClipsSchema))
                .forEach(clips => readRegions(clips, asDefined(track, "Region(Clips) must have an id.")))
        }

        const readAnyRegion = (clip: ClipSchema, trackId: string): void => {
            const trackBox = asDefined(this.#mapTrackBoxes.get(trackId), `Could not find track for ${trackId}`)
            clip.content?.forEach((content: TimelineSchema) => {
                if (isInstanceOf(content, ClipsSchema)) {
                    readAnyRegionContent(clip, content)
                } else if (isInstanceOf(content, NotesSchema)) {
                    readNoteRegionContent(clip, content, trackBox)
                }
            })
        }

        const readNoteRegionContent = (clip: ClipSchema, notes: NotesSchema, trackBox: TrackBox): void => {
            const collectionBox = NoteEventCollectionBox.create(this.#boxGraph, UUID.generate())
            NoteRegionBox.create(this.#boxGraph, UUID.generate(), box => {
                const position = asDefined(clip.time, "Time not defined")
                const duration = asDefined(clip.duration, "Duration not defined")
                box.position.setValue(position * PPQN.Quarter)
                box.duration.setValue(duration * PPQN.Quarter)
                box.label.setValue(clip.name ?? "")
                box.loopDuration.setValue(duration * PPQN.Quarter)
                box.mute.setValue(clip.enable === false)
                box.events.refer(collectionBox.owners)
                box.regions.refer(trackBox.regions)
            })
            notes.notes?.forEach(note => {
                NoteEventBox.create(this.#boxGraph, UUID.generate(), box => {
                    box.position.setValue(note.time * PPQN.Quarter)
                    box.duration.setValue(note.duration * PPQN.Quarter)
                    box.pitch.setValue(note.key)
                    box.velocity.setValue(note.vel ?? 1.0)
                    box.events.refer(collectionBox.events)
                })
            })
        }

        const readAnyRegionContent = (clip: ClipSchema, content: ClipsSchema): void => {
            const contentClip = content.clips.at(0)
            if (isUndefined(contentClip)) {
                console.warn(clip, "audio-clip without content-clip?")
                return
            }
            const innerContent = contentClip.content?.at(0) as Nullish<TimelineSchema>
            // TODO From which point is it guaranteed that this is an audio region?
            if (isInstanceOf(innerContent, WarpsSchema)) {
                const audio = innerContent?.content?.at(0) as Nullish<AudioSchema>
                const path = asDefined(audio?.file.path)
                const sample = this.#samples.load(path)
                console.debug(path, sample.byteLength)
            }
        }

        arrangement?.lanes?.lanes?.filter(timeline => isInstanceOf(timeline, LanesSchema)).forEach(readLane)
    }

    #contentToTrackType(contentType?: string): TrackType {
        switch (contentType) {
            case "audio":
                return TrackType.Audio
            case "notes":
                return TrackType.Notes
            default:
                return TrackType.Undefined
        }
    }
}