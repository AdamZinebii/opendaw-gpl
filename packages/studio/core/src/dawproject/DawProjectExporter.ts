import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    ArrangementSchema,
    AudioAlgorithm,
    AudioSchema,
    BuiltinDeviceSchema,
    ChannelRole,
    ChannelSchema,
    ClipSchema,
    ClipsSchema,
    DeviceRole,
    DeviceSchema,
    FileReferenceSchema,
    LanesSchema,
    NoteSchema,
    NotesSchema,
    ParameterEncoder,
    ProjectSchema,
    RealParameterSchema,
    TimelineSchema,
    TimeSignatureParameterSchema,
    TimeUnit,
    TrackSchema,
    TransportSchema,
    Unit,
    WarpSchema,
    WarpsSchema
} from "@opendaw/lib-dawproject"
import {asDefined, asInstanceOf, Color, isDefined, isInstanceOf, Nullish, Option} from "@opendaw/lib-std"
import {
    AudioFileBox,
    AudioRegionBox,
    AudioUnitBox,
    BoxVisitor,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    TrackBox,
    ValueEventCollectionBox,
    ValueRegionBox
} from "@opendaw/studio-boxes"
import {AddressReferenceId, BooleanField, Box, Field, StringField} from "@opendaw/lib-box"
import {dbToGain, PPQN} from "@opendaw/lib-dsp"
import {AudioUnitType} from "@opendaw/studio-enums"
import {Project} from "../Project"

export class DawProjectExporter {
    static exportProject(project: Project): DawProjectExporter {
        return new DawProjectExporter(project)
    }

    static readonly #CHANNEL_FIELD_KEY = 0x8001

    readonly #ids: AddressReferenceId

    readonly #project: Project

    constructor(project: Project) {
        this.#project = project

        this.#ids = new AddressReferenceId()
    }

    toProjectSchema(): ProjectSchema {
        return Xml.element({
            version: "1.0",
            application: Xml.element({
                name: "openDAW",
                version: "0.1"
            }, ApplicationSchema),
            transport: this.#writeTransport(),
            structure: this.#writeStructure(),
            arrangement: Xml.element({
                lanes: Xml.element({
                    lanes: this.#writeLanes(),
                    timeUnit: TimeUnit.BEATS
                }, LanesSchema)
            }, ArrangementSchema),
            scenes: []
        }, ProjectSchema)
    }

    #writeTransport(): TransportSchema {
        const {timelineBox} = this.#project
        return Xml.element({
            tempo: Xml.element({
                value: timelineBox.bpm.getValue(),
                unit: Unit.BPM
            }, RealParameterSchema),
            timeSignature: Xml.element({
                numerator: timelineBox.signature.nominator.getValue(),
                denominator: timelineBox.signature.denominator.getValue()
            }, TimeSignatureParameterSchema)
        }, TransportSchema)
    }

    #writeStructure(): ReadonlyArray<TrackSchema> {
        return this.#collectAudioUnitBoxes()
            .map(box => {
                const inputBox = box.input.pointerHub.incoming().at(0)?.box
                return Xml.element({
                    id: this.#ids.getOrCreate(box.address),
                    name: this.#readLabel(inputBox),
                    loaded: true,
                    contentType: (() =>
                        // TODO Another location to remember to put devices in...?
                        //  We could also read the first track type?
                        inputBox?.accept<BoxVisitor<string>>({
                            visitTapeDeviceBox: () => "audio",
                            visitVaporisateurDeviceBox: () => "notes",
                            visitNanoDeviceBox: () => "notes",
                            visitPlayfieldDeviceBox: () => "notes"
                        }))() ?? undefined,
                    channel: Xml.element({
                        id: this.#ids.getOrCreate(box.address.append(DawProjectExporter.#CHANNEL_FIELD_KEY)),
                        role: (() => {
                            switch (box.type.getValue()) {
                                case AudioUnitType.Instrument:
                                    return ChannelRole.REGULAR
                                case AudioUnitType.Aux:
                                    return ChannelRole.EFFECT
                                case AudioUnitType.Output:
                                    return ChannelRole.MASTER
                            }
                            return undefined
                        })(),
                        devices: [
                            ...(this.#writeDevices(box.midiEffects, DeviceRole.NOTE_FX)),
                            ...(this.#writeDevices(box.input, DeviceRole.INSTRUMENT)),
                            ...(this.#writeDevices(box.audioEffects, DeviceRole.AUDIO_FX))
                        ],
                        volume: ParameterEncoder.linear(dbToGain(box.volume.getValue()), 0.0, 2.0,
                            "Volume", this.#ids.getOrCreate(box.volume.address)),
                        pan: ParameterEncoder.normalized((box.panning.getValue() + 1.0) / 2.0, 0.0, 1.0,
                            "Pan", this.#ids.getOrCreate(box.panning.address))
                    }, ChannelSchema)
                }, TrackSchema)
            })
    }

    #writeDevices(field: Field, deviceRole: string): ReadonlyArray<DeviceSchema> {
        return field.pointerHub.incoming().map(({box}) => {
            const enabledField: Option<BooleanField> = "enabled" in box && isInstanceOf(box.enabled, BooleanField)
                ? Option.wrap(box.enabled) : Option.None
            return Xml.element({
                id: this.#ids.getOrCreate(box.address),
                name: box.name,
                deviceID: box.name,
                deviceRole,
                deviceName: this.#readLabel(box),
                deviceVendor: "openDAW",
                automatedParameters: [],
                enabled: enabledField.mapOr(field => ParameterEncoder.bool(field.getValue(),
                    "On/Off", this.#ids.getOrCreate(field.address)), undefined)
            }, BuiltinDeviceSchema)
        })
    }

    #writeLanes(): ReadonlyArray<TimelineSchema> {
        return this.#collectAudioUnitBoxes()
            .flatMap(audioUnitBox => audioUnitBox.tracks.pointerHub.incoming()
                .map(({box}) => asInstanceOf(box, TrackBox))
                .sort((a, b) => a.index.getValue() - b.index.getValue())
                .map(trackBox => Xml.element({
                    id: this.#ids.getOrCreate(trackBox.address),
                    track: this.#ids.getOrCreate(audioUnitBox.address),
                    lanes: trackBox.regions.pointerHub.incoming()
                        .map(({box}) => asDefined(box.accept<BoxVisitor<ClipsSchema>>({
                            visitAudioRegionBox: (region: AudioRegionBox) => this.#writeAudioRegion(region),
                            visitNoteRegionBox: (region: NoteRegionBox) => this.#writeNoteRegion(region),
                            visitValueRegionBox: (region: ValueRegionBox) => this.#writeValueRegion(region)
                        }), "Could not write region."))
                }, LanesSchema)))
    }

    #writeAudioRegion(region: AudioRegionBox): ClipsSchema {
        const audioFileBox = asInstanceOf(region.file.targetVertex.unwrap("No file at region").box, AudioFileBox)
        const audioElement = this.#project.sampleManager.getOrCreate(audioFileBox.address.uuid).data
            .map(({numberOfFrames, sampleRate, numberOfChannels}) => Xml.element({
                duration: numberOfFrames / sampleRate,
                channels: numberOfChannels,
                sampleRate,
                algorithm: AudioAlgorithm.REPITCH,
                file: Xml.element({
                    path: `samples/${audioFileBox.fileName.getValue()}.wav`,
                    external: false
                }, FileReferenceSchema)
            }, AudioSchema)).unwrap("Could not load sample.")
        const duration = region.duration.getValue() / PPQN.Quarter
        return Xml.element({
            clips: [Xml.element({
                time: region.position.getValue() / PPQN.Quarter,
                duration,
                contentTimeUnit: TimeUnit.BEATS,
                playStart: 0.0,
                loopStart: 0.0,
                loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                enable: !region.mute.getValue(),
                name: region.label.getValue(),
                color: this.#hueToColor(region.hue.getValue()),
                content: [Xml.element({
                    content: [audioElement],
                    contentTimeUnit: "beats",
                    warps: [
                        Xml.element({
                            time: 0.0,
                            contentTime: 0.0
                        }, WarpSchema),
                        Xml.element({
                            time: duration,
                            contentTime: audioElement.duration
                        }, WarpSchema)
                    ]
                }, WarpsSchema)]
            }, ClipSchema)]
        }, ClipsSchema)
    }

    #writeNoteRegion(region: NoteRegionBox): ClipsSchema {
        const collectionBox = asInstanceOf(region.events.targetVertex
            .unwrap("No notes in region").box, NoteEventCollectionBox)
        return Xml.element({
            clips: [Xml.element({
                time: region.position.getValue() / PPQN.Quarter,
                duration: region.duration.getValue() / PPQN.Quarter,
                contentTimeUnit: TimeUnit.BEATS,
                playStart: 0.0,
                loopStart: 0.0,
                loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                enable: !region.mute.getValue(),
                name: region.label.getValue(),
                color: this.#hueToColor(region.hue.getValue()),
                content: [Xml.element({
                    notes: collectionBox.events.pointerHub.incoming()
                        .map(({box}) => asInstanceOf(box, NoteEventBox))
                        .map(box => Xml.element({
                            time: box.position.getValue() / PPQN.Quarter,
                            duration: box.duration.getValue() / PPQN.Quarter,
                            key: box.pitch.getValue(),
                            channel: 0,
                            vel: box.velocity.getValue(),
                            rel: box.velocity.getValue()
                        }, NoteSchema))
                }, NotesSchema)]
            }, ClipSchema)]
        }, ClipsSchema)
    }

    #writeValueRegion(region: ValueRegionBox): ClipsSchema {
        const collectionBox = asInstanceOf(region.events.targetVertex
            .unwrap("No event in region").box, ValueEventCollectionBox)
        return Xml.element({
            clips: [Xml.element({
                time: region.position.getValue() / PPQN.Quarter,
                duration: region.duration.getValue() / PPQN.Quarter,
                contentTimeUnit: TimeUnit.BEATS,
                playStart: 0.0,
                loopStart: 0.0,
                loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                enable: !region.mute.getValue(),
                name: region.label.getValue(),
                color: this.#hueToColor(region.hue.getValue()),
                content: [] // TODO
            }, ClipSchema)]
        }, ClipsSchema)
    }

    #collectAudioUnitBoxes(): ReadonlyArray<AudioUnitBox> {
        return this.#project.rootBox.audioUnits.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, AudioUnitBox))
            .sort((a, b) => a.index.getValue() - b.index.getValue())
    }

    #readLabel(box: Nullish<Box>): string {
        return isDefined(box) && "label" in box && isInstanceOf(box.label, StringField)
            ? box.label.getValue()
            : "Unknown"
    }

    #hueToColor(hue: number): string {return Color.hslToHex(hue, 1.0, 0.60)}
}