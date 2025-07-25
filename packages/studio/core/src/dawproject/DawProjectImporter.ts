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
import {
    asDefined,
    assert,
    identity,
    int,
    isInstanceOf,
    isUndefined,
    Nullish,
    Option,
    panic,
    SortedSet,
    UUID
} from "@opendaw/lib-std"
import {DawProjectIO} from "./DawProjectIO"
import {
    AudioBusBox,
    AudioFileBox,
    AudioRegionBox,
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

export class DawProjectImporter {
    static async importProject(schema: ProjectSchema,
                               resources: DawProjectIO.Resources): Promise<DawProjectImporter> {
        return new DawProjectImporter(schema, resources).#read()
    }

    readonly #schema: ProjectSchema
    readonly #resources: DawProjectIO.Resources

    readonly #mapTrackBoxes: Map<string, TrackBox>
    readonly #audioIDs: SortedSet<UUID.Format, UUID.Format>

    readonly #boxGraph: BoxGraph<BoxIO.TypeMap>
    readonly #rootBox: RootBox
    readonly #masterBusBox: AudioBusBox
    readonly #masterAudioUnit: AudioUnitBox
    readonly #timelineBox: TimelineBox
    readonly #userInterfaceBox: UserInterfaceBox

    private constructor(schema: ProjectSchema, resources: DawProjectIO.Resources) {
        this.#schema = schema
        this.#resources = resources

        this.#mapTrackBoxes = new Map<string, TrackBox>()
        this.#audioIDs = UUID.newSet(identity)

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
    }

    async #read() {
        this.#readTransport()
        this.#readStructure()
        await this.#readArrangement()
        this.#boxGraph.endTransaction()
        this.#boxGraph.verifyPointers()
        return this
    }

    get audioIDs(): SortedSet<UUID.Format, UUID.Format> {return this.#audioIDs}
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
                const trackType = this.#contentToTrackType(lane.contentType)
                const channel = asDefined(lane.channel, "Track has no Channel")
                if (channel.role === "regular") {
                    const audioUnitBox = AudioUnitBox.create(this.#boxGraph, UUID.generate(), box => {
                        box.index.setValue(index)
                        box.type.setValue(AudioUnitType.Instrument)
                        box.output.refer(this.#masterBusBox.input)
                        box.collection.refer(this.#rootBox.audioUnits)
                    })
                    const trackBox = TrackBox.create(this.#boxGraph, UUID.generate(), box => {
                        box.type.setValue(trackType)
                        box.index.setValue(0)
                        box.tracks.refer(audioUnitBox.tracks)
                        box.target.refer(audioUnitBox)
                    })
                    this.#mapTrackBoxes.set(asDefined(lane.id, "Track must have an id."), trackBox)
                    if (trackType === TrackType.Notes) {
                        InstrumentFactories.Vaporisateur
                            .create(this.#boxGraph, audioUnitBox.input, lane.name ?? "", IconSymbol.Piano)
                    } else if (trackType === TrackType.Audio) {
                        InstrumentFactories.Tape
                            .create(this.#boxGraph, audioUnitBox.input, lane.name ?? "", IconSymbol.Waveform)
                    }
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

    #readArrangement(): Promise<unknown> {
        const {arrangement} = this.#schema

        const readRegions = ({clips}: ClipsSchema, track: string): Promise<unknown> =>
            Promise.all(clips.map(clip => readAnyRegion(clip, track)))

        const readLane = (lane: LanesSchema): Promise<unknown> => {
            const track = lane.track // links to track in structure
            return Promise.all(lane?.lanes?.filter(timeline => isInstanceOf(timeline, ClipsSchema))
                .map(clips => readRegions(clips, asDefined(track, "Region(Clips) must have an id."))) ?? [])
        }

        const readAnyRegion = (clip: ClipSchema, trackId: string): Promise<unknown> => {
            const trackBox = asDefined(this.#mapTrackBoxes.get(trackId), `Could not find track for ${trackId}`)
            return Promise.all(clip.content?.map(async (content: TimelineSchema) => {
                if (isInstanceOf(content, ClipsSchema)) {
                    await readAnyRegionContent(clip, content, trackBox)
                } else if (isInstanceOf(content, NotesSchema)) {
                    readNoteRegionContent(clip, content, trackBox)
                }
            }) ?? [])
        }

        const readNoteRegionContent = (clip: ClipSchema, notes: NotesSchema, trackBox: TrackBox): void => {
            const collectionBox = NoteEventCollectionBox.create(this.#boxGraph, UUID.generate())
            NoteRegionBox.create(this.#boxGraph, UUID.generate(), box => {
                const position = asDefined(clip.time, "Time not defined")
                const duration = asDefined(clip.duration, "Duration not defined")
                const loopDuration = clip.loopEnd ?? duration
                box.position.setValue(position * PPQN.Quarter)
                box.duration.setValue(duration * PPQN.Quarter)
                box.label.setValue(clip.name ?? "")
                box.loopDuration.setValue(loopDuration * PPQN.Quarter)
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

        const readAnyRegionContent = async (clip: ClipSchema, content: ClipsSchema, trackBox: TrackBox): Promise<unknown> => {
            const contentClip = content.clips.at(0)
            if (isUndefined(contentClip)) {
                console.warn(clip, "audio-clip without content-clip?")
                return
            }
            const innerContent = contentClip.content?.at(0) as Nullish<TimelineSchema>
            // TODO From which point is it guaranteed that this is an audio region?
            if (isInstanceOf(innerContent, WarpsSchema)) {
                const audio = innerContent?.content?.at(0) as Nullish<AudioSchema>
                if (isUndefined(audio)) {return}
                const {path, external} = audio.file
                assert(external !== true, "File cannot be external")
                const {uuid, name} = this.#resources.fromPath(path)
                const audioFileBox: AudioFileBox = this.#boxGraph.findBox<AudioFileBox>(uuid)
                    .unwrapOrElse(() => AudioFileBox.create(this.#boxGraph, uuid, box => box.fileName.setValue(name)))
                this.#audioIDs.add(uuid, true)
                AudioRegionBox.create(this.#boxGraph, UUID.generate(), box => {
                    const position = asDefined(clip.time, "Time not defined")
                    const duration = asDefined(clip.duration, "Duration not defined")
                    const loopDuration = clip.loopEnd ?? duration
                    box.position.setValue(position * PPQN.Quarter)
                    box.duration.setValue(duration * PPQN.Quarter)
                    box.label.setValue(clip.name ?? "")
                    box.loopDuration.setValue(loopDuration * PPQN.Quarter)
                    box.mute.setValue(clip.enable === false)
                    box.regions.refer(trackBox.regions)
                    box.file.refer(audioFileBox)
                })
            }
        }
        return Promise.all(arrangement?.lanes?.lanes?.filter(timeline => isInstanceOf(timeline, LanesSchema))
            .map(readLane) ?? [])
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