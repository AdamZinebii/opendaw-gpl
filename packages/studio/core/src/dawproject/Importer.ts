import {
    ArrayMultimap,
    asDefined,
    assert,
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
import {BoxGraph, Field, PointerField} from "@opendaw/lib-box"
import {gainToDb} from "@opendaw/lib-dsp"
import {
    ChannelRole,
    ChannelSchema,
    DeviceRole,
    DeviceSchema,
    LaneSchema,
    ProjectSchema,
    SendSchema,
    SendType,
    TrackSchema,
    TransportSchema
} from "@opendaw/lib-dawproject"
import {AudioSendRouting, AudioUnitType, Pointers} from "@opendaw/studio-enums"
import {
    AudioBusBox,
    AudioUnitBox,
    AuxSendBox,
    BoxIO,
    DelayDeviceBox,
    GrooveShuffleBox,
    RootBox,
    TimelineBox,
    UserInterfaceBox
} from "@opendaw/studio-boxes"
import {IconSymbol, ProjectDecoder} from "@opendaw/studio-adapters"
import {DawProjectIO} from "./DawProjectIO"
import {InstrumentBox} from "../InstrumentBox"
import {AudioUnitOrdering} from "../AudioUnitOrdering"
import {InstrumentFactories} from "../InstrumentFactories"
import {ColorCodes} from "../ColorCodes"

export namespace Importer {
    type AudioBusUnit = { audioBusBox: AudioBusBox, audioUnitBox: AudioUnitBox }
    type InstrumentUnit = { instrumentBox: InstrumentBox, audioUnitBox: AudioUnitBox }

    export type Creation = {
        audioIDs: ReadonlyArray<UUID.Format>,
        skeleton: ProjectDecoder.Skeleton
    }

    type PointerDestinations = Pointers.InstrumentHost | Pointers.AudioOutput
    export const construct = async (schema: ProjectSchema, resources: DawProjectIO.ResourceProvider): Promise<Creation> => {
        const boxGraph = new BoxGraph<BoxIO.TypeMap>(Option.wrap(BoxIO.create))
        boxGraph.beginTransaction()
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

        let primaryAudioBusUnitOption: Option<AudioBusUnit> = Option.None

        const destinations = new Map<string, Field<PointerDestinations>>()
        const addDestination = (destination: string, target: Field<PointerDestinations>) => {
            if (destinations.has(destination)) {return panic(`Destination '${destination}' is already defined`)}
            destinations.set(destination, target)
        }

        const pointers: Array<{
            destination: string,
            pointer: PointerField<PointerDestinations>
        }> = []
        const sortAudioUnits: Multimap<int, AudioUnitBox> = new ArrayMultimap<int, AudioUnitBox>()

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
                    pointers.push({destination, pointer: auxSendBox.targetBus})
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
                console.debug(depth, channel.id, channel.role, track.name, track.contentType)
                if (channel.role === ChannelRole.REGULAR) {
                    const {audioUnitBox} = createInstrumentUnit(track, AudioUnitType.Instrument)
                    ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                    pointers.push({destination: channel.destination!, pointer: audioUnitBox.output})
                } else if (channel.role === ChannelRole.EFFECT) {
                    const {audioBusBox, audioUnitBox} = createAudioBusUnit(track, AudioUnitType.Aux, IconSymbol.Effects)
                    addDestination(channelId, audioBusBox.input)
                    ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                    pointers.push({destination: channel.destination!, pointer: audioUnitBox.output})
                } else if (channel.role === ChannelRole.MASTER) {
                    console.debug(`Found a master channel in '${track.name}' with destination '${channel.destination}' and contentType '${track.contentType}'`)
                    const isMostLikelyPrimaryOutput = primaryAudioBusUnitOption.isEmpty()
                        && depth === 0
                        && isUndefined(channel.destination)
                        && track.contentType !== "tracks"
                    if (isMostLikelyPrimaryOutput) {
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Output, IconSymbol.SpeakerHeadphone)
                        const {audioBusBox, audioUnitBox} = audioBusUnit
                        addDestination(channelId, audioBusBox.input)
                        audioUnitBox.output.refer(rootBox.outputDevice)
                        primaryAudioBusUnitOption = Option.wrap(audioBusUnit)
                    } else {
                        console.debug("GROUP START", track.name, track.contentType)
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Bus, IconSymbol.AudioBus)
                        const {audioBusBox, audioUnitBox} = audioBusUnit
                        addDestination(channelId, audioBusBox.input)
                        ifDefined(channel.destination, destination =>
                            pointers.push({destination, pointer: audioUnitBox.output}))
                        ifDefined(channel.sends, sends => createSends(audioUnitBox, sends))
                        readTracks(track.tracks ?? [], depth + 1)
                    }
                } else {
                    return panic(`Unknown channel role ('${channel.role}')`)
                }
            })
        readTracks(schema.structure, 0)
        pointers.forEach(({destination, pointer}) =>
            pointer.refer(asDefined(destinations.get(destination), `${destination} cannot be found.`)))

        console.debug("=== SORTING ===")
        let index = 0
        sortAudioUnits
            .sortKeys(NumberComparator)
            .forEach((_index, boxes) => {for (const box of boxes) {box.index.setValue(index++)}})
        console.debug("===============")
        boxGraph.endTransaction()
        boxGraph.verifyPointers()
        const {
            audioBusBox: primaryAudioBusBox,
            audioUnitBox: primaryAudioUnitBox
        } = primaryAudioBusUnitOption.unwrap("Did not find a primary output")
        return {
            audioIDs: [],
            skeleton: {
                boxGraph,
                mandatoryBoxes: {
                    rootBox,
                    timelineBox,
                    masterBusBox: primaryAudioBusBox,
                    masterAudioUnit: primaryAudioUnitBox,
                    userInterfaceBox
                }
            }
        }
    }

    const readTransport = ({tempo, timeSignature}: TransportSchema,
                           {bpm, signature: {nominator, denominator}}: TimelineBox) => {
        ifDefined(tempo?.value, value => bpm.setValue(value))
        ifDefined(timeSignature?.numerator, value => nominator.setValue(value))
        ifDefined(timeSignature?.denominator, value => denominator.setValue(value))
    }
}