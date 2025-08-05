import {
    ChannelRole,
    ChannelSchema,
    LaneSchema,
    ProjectSchema,
    TrackSchema,
    TransportSchema
} from "@opendaw/lib-dawproject"
import {DawProjectIO} from "./DawProjectIO"
import {BoxGraph} from "@opendaw/lib-box"
import {
    AudioBusBox,
    AudioUnitBox,
    BoxIO,
    GrooveShuffleBox,
    RootBox,
    TimelineBox,
    UserInterfaceBox
} from "@opendaw/studio-boxes"
import {
    ArrayMultimap,
    asDefined,
    ifDefined,
    int,
    isInstanceOf,
    isUndefined,
    Multimap,
    NumberComparator,
    Option,
    panic,
    UUID,
    ValueMapping
} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-adapters"
import {AudioUnitType} from "@opendaw/studio-enums"
import {gainToDb} from "@opendaw/lib-dsp"
import {AudioUnitOrdering} from "../AudioUnitOrdering"
import {readLabel} from "./utils"

export namespace Importer {
    type AudioBusUnit = { audioBusBox: AudioBusBox, audioUnitBox: AudioUnitBox }

    export const toProject = (schema: ProjectSchema, resources: DawProjectIO.ResourceProvider) => {
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
        UserInterfaceBox.create(boxGraph, UUID.generate(), box => box.root.refer(rootBox.users))

        let masterAudioBusUnit: Option<AudioBusUnit> = Option.None

        const destinations: Map<string, AudioBusUnit> = new Map<string, AudioBusUnit>()
        const sortIndices: Multimap<int, AudioUnitBox> = new ArrayMultimap<int, AudioUnitBox>()

        const createAudioBusUnit = (track: TrackSchema,
                                    type: AudioUnitType,
                                    icon: IconSymbol): AudioBusUnit => {
            const channel: ChannelSchema = asDefined(track.channel)
            const audioBusBox = AudioBusBox.create(rootBox.graph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioBusses)
                box.label.setValue(track.name ?? "")
                box.icon.setValue(IconSymbol.toName(icon))
                box.color.setValue(track.color ?? "red")
                box.enabled.setValue(true)
            })
            const audioUnitBox = AudioUnitBox.create(rootBox.graph, UUID.generate(), box => {
                box.collection.refer(rootBox.audioUnits)
                box.output.refer(audioBusBox.input)
                box.type.setValue(type)
                box.volume.setValue(gainToDb(channel.volume?.value ?? 1.0))
                box.panning.setValue(ValueMapping.bipolar().y(channel.pan?.value ?? 0.5))
                box.mute.setValue(channel.mute?.value === true)
                box.solo.setValue(channel.solo === true)
            })
            audioBusBox.output.refer(audioUnitBox.input)
            sortIndices.add(AudioUnitOrdering[type], audioUnitBox)
            return {audioBusBox, audioUnitBox}
        }

        const readTracks = (lanes: ReadonlyArray<LaneSchema>, depth: int): void => lanes
            .filter((lane: LaneSchema) => isInstanceOf(lane, TrackSchema))
            .forEach((track: TrackSchema) => {
                const channel = asDefined(track.channel, "Track has no Channel")
                console.debug(depth, channel.role, track.name, track.contentType)
                if (channel.role === ChannelRole.REGULAR) {
                    createAudioBusUnit(track, AudioUnitType.Instrument, IconSymbol.Guitar)
                } else if (channel.role === ChannelRole.EFFECT) {
                    createAudioBusUnit(track, AudioUnitType.Aux, IconSymbol.Effects)
                } else if (channel.role === ChannelRole.MASTER) {
                    console.debug(`Found a master channel in '${track.name}' with destination '${channel.destination}' and contentType '${track.contentType}'`)
                    const isMostLikelyPrimaryOutput = masterAudioBusUnit.isEmpty()
                        && depth === 0
                        && isUndefined(channel.destination)
                        && track.contentType !== "tracks"
                    if (isMostLikelyPrimaryOutput) {
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Output, IconSymbol.SpeakerHeadphone)
                        destinations.set(asDefined(channel.id, "Channel must have an Id"), audioBusUnit)
                        masterAudioBusUnit = Option.wrap(audioBusUnit)
                    } else {
                        console.debug("GROUP START", track.name, track.contentType)
                        const audioBusUnit = createAudioBusUnit(track, AudioUnitType.Bus, IconSymbol.AudioBus)
                        destinations.set(asDefined(channel.id, "Channel must have an Id"), audioBusUnit)
                        readTracks(track.tracks ?? [], depth + 1)
                    }
                } else {
                    return panic(`Unknown channel role ('${channel.role}')`)
                }
            })
        readTracks(schema.structure, 0)
        // TODO Resolve all pointer

        console.debug("=== SORTING ===")
        let index = 0
        sortIndices.sortKeys(NumberComparator).forEach((_index, boxes) => {
            for (const box of boxes) {
                box.index.setValue(index++)
                const inputBox = box.input.pointerHub.incoming().at(0)?.box
                console.debug(`#${box.index.getValue()} type: '${box.type.getValue()}', input: '${readLabel(inputBox)}'`)
            }
        })
    }

    const readTransport = ({tempo, timeSignature}: TransportSchema,
                           {bpm, signature: {nominator, denominator}}: TimelineBox) => {
        ifDefined(tempo?.value, value => bpm.setValue(value))
        ifDefined(timeSignature?.numerator, value => nominator.setValue(value))
        ifDefined(timeSignature?.denominator, value => denominator.setValue(value))
    }
}