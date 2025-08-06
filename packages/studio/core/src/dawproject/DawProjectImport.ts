import {
    ArrayMultimap,
    asDefined,
    asInstanceOf,
    assert,
    Color,
    ifDefined,
    int,
    isInstanceOf,
    isUndefined,
    Multimap,
    Nullish,
    NumberComparator,
    Option,
    panic,
    UUID,
    ValueMapping
} from "@opendaw/lib-std"
import {BoxGraph, PointerField} from "@opendaw/lib-box"
import {gainToDb, PPQN} from "@opendaw/lib-dsp"
import {
    ArrangementSchema,
    AudioSchema,
    ChannelRole,
    ChannelSchema,
    ClipSchema,
    ClipsSchema,
    DeviceRole,
    DeviceSchema,
    LaneSchema,
    LanesSchema,
    NotesSchema,
    ProjectSchema,
    SendSchema,
    SendType,
    TimelineSchema,
    TrackSchema,
    TransportSchema,
    WarpsSchema
} from "@opendaw/lib-dawproject"
import {AudioSendRouting, AudioUnitType, Pointers} from "@opendaw/studio-enums"
import {
    AudioBusBox,
    AudioFileBox,
    AudioRegionBox,
    AudioUnitBox,
    AuxSendBox,
    BoxIO,
    BoxVisitor,
    DelayDeviceBox,
    GrooveShuffleBox,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    RootBox,
    TimelineBox,
    TrackBox,
    UserInterfaceBox
} from "@opendaw/studio-boxes"
import {IconSymbol, ProjectDecoder, TrackType} from "@opendaw/studio-adapters"
import {DawProjectIO} from "./DawProjectIO"
import {InstrumentBox} from "../InstrumentBox"
import {AudioUnitOrdering} from "../AudioUnitOrdering"
import {InstrumentFactories} from "../InstrumentFactories"
import {ColorCodes} from "../ColorCodes"
import {Colors} from "../Colors"

export namespace DawProjectImport {
    type AudioBusUnit = { audioBusBox: AudioBusBox, audioUnitBox: AudioUnitBox }
    type InstrumentUnit = { instrumentBox: InstrumentBox, audioUnitBox: AudioUnitBox }

    const readTransport = ({tempo, timeSignature}: TransportSchema,
                           {bpm, signature: {nominator, denominator}}: TimelineBox) => {
        ifDefined(tempo?.value, value => bpm.setValue(value))
        ifDefined(timeSignature?.numerator, value => nominator.setValue(value))
        ifDefined(timeSignature?.denominator, value => denominator.setValue(value))
    }

    export type Result = {
        audioIds: ReadonlyArray<UUID.Format>,
        skeleton: ProjectDecoder.Skeleton
    }

    export const read = async (schema: ProjectSchema, resources: DawProjectIO.ResourceProvider): Promise<Result> => {
        const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        boxGraph.beginTransaction()

        // Create fundamental boxes
        //
        const isoString = new Date().toISOString()
        console.debug(`New Project imported on ${isoString}`)
        const grooveShuffleBox = GrooveShuffleBox.create(boxGraph, UUID.generate(),
            box => box.label.setValue("Groove Shuffle"))
        const timelineBox = TimelineBox.create(boxGraph, UUID.generate(),
            box => ifDefined(schema.transport, transport => readTransport(transport, box)))
        const rootBox = RootBox.create(boxGraph, UUID.generate(), box => {
            box.groove.refer(grooveShuffleBox)
            box.created.setValue(isoString)
            box.timeline.refer(timelineBox.root)
        })
        const userInterfaceBox = UserInterfaceBox.create(boxGraph, UUID.generate(), box => box.root.refer(rootBox.users))

        // <---

        let primaryAudioBusUnitOption: Option<AudioBusUnit> = Option.None

        const audioIdSet = UUID.newSet<UUID.Format>(uuid => uuid)
        const audioUnits = new Map<string, AudioUnitBox>()
        const registerAudioUnit = (trackId: string, target: AudioUnitBox) => {
            if (audioUnits.has(trackId)) {return panic(`trackId '${trackId}' is already defined`)}
            audioUnits.set(trackId, target)
        }
        const audioBusses = new Map<string, AudioBusBox>()
        const registerAudioBus = (channelId: string, audioBusBox: AudioBusBox) => {
            if (audioBusses.has(channelId)) {return panic(`channelId '${channelId}' is already defined`)}
            audioBusses.set(channelId, audioBusBox)
        }
        const outputPointers: Array<{
            target: string, pointer: PointerField<Pointers.InstrumentHost | Pointers.AudioOutput>
        }> = []
        const sortAudioUnits: Multimap<int, AudioUnitBox> = new ArrayMultimap<int, AudioUnitBox>()

        // Reading methods
        //
        const createEffect = ({deviceRole, deviceVendor, deviceID, deviceName}: DeviceSchema,
                              target: AudioUnitBox,
                              key: keyof Pick<AudioUnitBox, "midiEffects" | "audioEffects">,
                              index: int) => {
            assert(deviceRole === DeviceRole.NOTE_FX || deviceRole === DeviceRole.AUDIO_FX, "Device is not an effect")
            if (deviceVendor === "openDAW") {
                // TODO Create openDAW effect device
                console.debug(`Found openDAW effect device '${deviceName}' with id '${deviceID}'`)
                const deviceKey = asDefined(deviceName) as keyof BoxIO.TypeMap
            }
            const field = target[key]
            // TODO Create placeholder device
            DelayDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(`${deviceName} (Placeholder #${index + 1})`)
                box.index.setValue(index)
                box.host.refer(field)
            })
        }

        const createSends = (audioUnitBox: AudioUnitBox, sends: ReadonlyArray<SendSchema>) => {
            sends
                // bitwig does not set enabled if it is enabled 🤥
                .filter((send) => isUndefined(send?.enable?.value) || send.enable.value)
                .forEach((send, index) => {
                    const destination = asDefined(send.destination, "destination is undefined")
                    const auxSendBox = AuxSendBox.create(boxGraph, UUID.generate(), box => {
                        const type = send.type as Nullish<SendType>
                        box.routing.setValue(type === SendType.PRE ? AudioSendRouting.Pre : AudioSendRouting.Post)
                        box.sendGain.setValue(gainToDb(send.volume?.value ?? 1.0)) // TODO Take unit into account
                        box.sendPan.setValue(ValueMapping.bipolar().y(send.pan?.value ?? 0.5)) // TODO Take unit into account
                        box.audioUnit.refer(audioUnitBox.auxSends)
                        box.index.setValue(index)
                    })
                    outputPointers.push({target: destination, pointer: auxSendBox.targetBus})
                    return auxSendBox
                })
        }

        const createInstrumentBox = (audioUnitBox: AudioUnitBox, track: TrackSchema, device: Nullish<DeviceSchema>): InstrumentBox => {
            // TODO Create openDAW device, if available
            if (track.contentType === "notes") {
                return InstrumentFactories.Vaporisateur
                    .create(boxGraph, audioUnitBox.input, track.name ?? "", IconSymbol.Piano)
            } else if (track.contentType === "audio") {
                return InstrumentFactories.Tape
                    .create(boxGraph, audioUnitBox.input, track.name ?? "", IconSymbol.Waveform)
            }
            return panic(`Cannot create instrument box for track '${track.name}' with contentType '${track.contentType}' and device '${device?.deviceName}'`)
        }

        const createInstrumentUnit = (track: TrackSchema,
                                      type: AudioUnitType): InstrumentUnit => {
            const channel: ChannelSchema = asDefined(track.channel)
            const audioUnitBox = AudioUnitBox.create(rootBox.graph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioUnits)
                box.type.setValue(type)
                box.volume.setValue(gainToDb(channel.volume?.value ?? 1.0))
                box.panning.setValue(ValueMapping.bipolar().y(channel.pan?.value ?? 0.5))
                box.mute.setValue(channel.mute?.value === true)
                box.solo.setValue(channel.solo === true)
            })
            sortAudioUnits.add(AudioUnitOrdering[type], audioUnitBox)
            const instrumentDevice: Nullish<DeviceSchema> = ifDefined(channel.devices, devices => {
                devices
                    .filter((device) => device.deviceRole === DeviceRole.NOTE_FX)
                    .forEach((device, index) => createEffect(device, audioUnitBox, "midiEffects", index))
                devices
                    .filter((device) => device.deviceRole === DeviceRole.AUDIO_FX)
                    .forEach((device, index) => createEffect(device, audioUnitBox, "audioEffects", index))
                return devices
                    .find((device) => device.deviceRole === DeviceRole.INSTRUMENT)
            })
            const instrumentBox = createInstrumentBox(audioUnitBox, track, instrumentDevice)
            return {instrumentBox, audioUnitBox}
        }

        const createAudioBusUnit = (track: TrackSchema,
                                    type: AudioUnitType,
                                    icon: IconSymbol): AudioBusUnit => {
            const channel: ChannelSchema = asDefined(track.channel)
            const audioUnitBox = AudioUnitBox.create(rootBox.graph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioUnits)
                box.type.setValue(type)
                box.volume.setValue(gainToDb(channel.volume?.value ?? 1.0))
                box.panning.setValue(ValueMapping.bipolar().y(channel.pan?.value ?? 0.5))
                box.mute.setValue(channel.mute?.value === true)
                box.solo.setValue(channel.solo === true)
            })
            sortAudioUnits.add(AudioUnitOrdering[type], audioUnitBox)
            const audioBusBox = AudioBusBox.create(rootBox.graph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioBusses)
                box.label.setValue(track.name ?? "")
                box.icon.setValue(IconSymbol.toName(icon))
                box.color.setValue(ColorCodes.forAudioType(type))
                box.enabled.setValue(true)
                box.output.refer(audioUnitBox.input)
            })
            ifDefined(channel.devices, devices => devices
                .filter((device) => device.deviceRole === DeviceRole.AUDIO_FX)
                .forEach((device, index) => createEffect(device, audioUnitBox, "audioEffects", index)))
            return {audioBusBox, audioUnitBox}
        }

        const readTracks = (lanes: ReadonlyArray<LaneSchema>, depth: int): void => lanes
            .filter((lane: LaneSchema) => isInstanceOf(lane, TrackSchema))
            .forEach((track: TrackSchema) => {
                const channel = asDefined(track.channel, "Track has no Channel")
                const channelId = asDefined(channel.id, "Channel must have an Id")
                if (channel.role === ChannelRole.REGULAR) {
                    const {audioUnitBox} = createInstrumentUnit(track, AudioUnitType.Instrument)
                    registerAudioUnit(asDefined(track.id, "Track must have an Id."), audioUnitBox)
                    ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                    outputPointers.push({target: channel.destination!, pointer: audioUnitBox.output})
                } else if (channel.role === ChannelRole.EFFECT) {
                    const {audioBusBox, audioUnitBox} = createAudioBusUnit(track, AudioUnitType.Aux, IconSymbol.Effects)
                    registerAudioBus(channelId, audioBusBox)
                    registerAudioUnit(asDefined(track.id, "Track must have an Id."), audioUnitBox)
                    ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                    outputPointers.push({target: channel.destination!, pointer: audioUnitBox.output})
                } else if (channel.role === ChannelRole.MASTER) {
                    const isMostLikelyPrimaryOutput = primaryAudioBusUnitOption.isEmpty()
                        && depth === 0
                        && isUndefined(channel.destination)
                        && track.contentType !== "tracks"
                    if (isMostLikelyPrimaryOutput) {
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Output, IconSymbol.SpeakerHeadphone)
                        const {audioBusBox, audioUnitBox} = audioBusUnit
                        registerAudioBus(channelId, audioBusBox)
                        registerAudioUnit(asDefined(track.id, "Track must have an Id."), audioUnitBox)
                        audioUnitBox.output.refer(rootBox.outputDevice)
                        primaryAudioBusUnitOption = Option.wrap(audioBusUnit)
                    } else {
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Bus, IconSymbol.AudioBus)
                        const {audioBusBox, audioUnitBox} = audioBusUnit
                        registerAudioBus(channelId, audioBusBox)
                        registerAudioUnit(asDefined(track.id, "Track must have an Id."), audioUnitBox)
                        ifDefined(channel.destination, destination =>
                            outputPointers.push({target: destination, pointer: audioUnitBox.output}))
                        ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                        readTracks(track.tracks ?? [], depth + 1)
                    }
                } else {
                    return panic(`Unknown channel role ('${channel.role}')`)
                }
            })
        readTracks(schema.structure, 0)

        const readArrangement = (arrangement: ArrangementSchema): Promise<unknown> => {
            const readTrackRegions = ({clips}: ClipsSchema, trackId: string): Promise<unknown> => {
                const audioUnitBox = asDefined(audioUnits.get(trackId), `Cannot find track for '${trackId}'`)
                if (audioUnitBox.type.getValue() === AudioUnitType.Output) {return Promise.resolve()}
                const inputTrackType = readInputTrackType(audioUnitBox)
                const index = audioUnitBox.tracks.pointerHub.incoming().length
                const trackBox: TrackBox = TrackBox.create(boxGraph, UUID.generate(), box => {
                    box.tracks.refer(audioUnitBox.tracks)
                    box.target.refer(audioUnitBox)
                    box.type.setValue(inputTrackType)
                    box.index.setValue(index)
                })
                return Promise.all(clips.map(clip => readAnyRegion(clip, trackBox)))
            }

            const readLane = (lane: LanesSchema): Promise<unknown> => {
                const track = lane.track // links to track in structure
                return Promise.all(lane?.lanes?.filter(timeline => isInstanceOf(timeline, ClipsSchema))
                    .map(clips => readTrackRegions(clips, asDefined(track, "Region(Clips) must have an id."))) ?? [])
            }

            const readAnyRegion = (clip: ClipSchema, trackBox: TrackBox): Promise<unknown> => {
                return Promise.all(clip.content?.map(async (content: TimelineSchema) => {
                    if (isInstanceOf(content, ClipsSchema)) {
                        await readAnyRegionContent(clip, content, trackBox)
                    } else if (isInstanceOf(content, NotesSchema)) {
                        readNoteRegionContent(clip, content, trackBox)
                    }
                }) ?? [])
            }

            const readNoteRegionContent = (clip: ClipSchema, notes: NotesSchema, trackBox: TrackBox): void => {
                const collectionBox = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                    const position = asDefined(clip.time, "Time not defined")
                    const duration = asDefined(clip.duration, "Duration not defined")
                    const loopDuration = clip.loopEnd ?? duration
                    box.position.setValue(position * PPQN.Quarter)
                    box.duration.setValue(duration * PPQN.Quarter)
                    box.label.setValue(clip.name ?? "")
                    box.loopDuration.setValue(loopDuration * PPQN.Quarter)
                    box.mute.setValue(clip.enable === false)
                    box.hue.setValue(isUndefined(clip.color)
                        ? ColorCodes.forTrackType(trackBox.type.getValue())
                        : Color.hexToHsl(clip.color).h)
                    box.events.refer(collectionBox.owners)
                    box.regions.refer(trackBox.regions)
                })
                notes.notes?.forEach(note => {
                    NoteEventBox.create(boxGraph, UUID.generate(), box => {
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
                // TODO Double-check: From which point is it guaranteed that this is an audio region?
                if (isInstanceOf(innerContent, WarpsSchema)) {
                    const {warps, content} = innerContent
                    const audio = content?.at(0) as Nullish<AudioSchema>
                    const warp0 = warps.at(0)
                    const warpN = warps.at(-1)
                    const warpDistance = asDefined(warpN?.time) - asDefined(warp0?.time)
                    if (isUndefined(audio)) {return}
                    const {path, external} = audio.file
                    assert(external !== true, "File cannot be external")
                    const {uuid, name} = resources.fromPath(path)
                    const audioFileBox: AudioFileBox = boxGraph.findBox<AudioFileBox>(uuid)
                        .unwrapOrElse(() => AudioFileBox.create(boxGraph, uuid, box => box.fileName.setValue(name)))
                    audioIdSet.add(uuid, true)
                    AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                        const position = asDefined(clip.time, "Time not defined")
                        const duration = asDefined(clip.duration, "Duration not defined")
                        const loopDuration = clip.loopEnd ?? warpDistance
                        box.position.setValue(position * PPQN.Quarter)
                        box.duration.setValue(duration * PPQN.Quarter)
                        box.label.setValue(clip.name ?? "")
                        box.loopOffset.setValue((-(contentClip.time ?? 0.0)) * PPQN.Quarter)
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
        await ifDefined(schema.arrangement, arrangement => readArrangement(arrangement))
        outputPointers.forEach(({target, pointer}) =>
            pointer.refer(asDefined(audioBusses.get(target), `${target} cannot be found.`).input))
        rootBox.audioUnits.pointerHub.incoming().forEach(({box}) => {
            const audioUnitBox = asInstanceOf(box, AudioUnitBox)
            if (audioUnitBox.type.getValue() !== AudioUnitType.Output
                && audioUnitBox.tracks.pointerHub.incoming().length === 0) {
                const inputTrackType = readInputTrackType(audioUnitBox)
                TrackBox.create(boxGraph, UUID.generate(), box => {
                    box.tracks.refer(audioUnitBox.tracks)
                    box.target.refer(audioUnitBox)
                    box.type.setValue(inputTrackType)
                    box.index.setValue(0)
                })
            }
        })
        {
            let index = 0
            sortAudioUnits
                .sortKeys(NumberComparator)
                .forEach((_, boxes) => {for (const box of boxes) {box.index.setValue(index++)}})
        }
        boxGraph.endTransaction()
        boxGraph.verifyPointers()
        const {audioBusBox: masterBusBox, audioUnitBox: masterAudioUnit} =
            primaryAudioBusUnitOption.unwrap("Did not find a primary output")
        return {
            audioIds: audioIdSet.values(),
            skeleton: {
                boxGraph,
                mandatoryBoxes: {rootBox, timelineBox, masterBusBox, masterAudioUnit, userInterfaceBox}
            }
        }
    }

    const readInputTrackType = (audioUnitBox: AudioUnitBox): TrackType => {
        const inputBox = audioUnitBox.input.pointerHub.incoming().at(0)?.box
        // TODO Can we find a better way to determine the track type?
        //  Because this would be another location to update when adding new instruments.
        return inputBox?.accept<BoxVisitor<TrackType>>({
            visitTapeDeviceBox: () => TrackType.Audio,
            visitNanoDeviceBox: () => TrackType.Notes,
            visitPlayfieldDeviceBox: () => TrackType.Notes,
            visitVaporisateurDeviceBox: () => TrackType.Notes
        }) ?? TrackType.Undefined
    }
}