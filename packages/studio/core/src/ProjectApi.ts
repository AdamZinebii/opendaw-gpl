import {assert, int, Option, panic, Strings, UUID} from "@opendaw/lib-std"
import {Field} from "@opendaw/lib-box"
import {AudioUnitType} from "@opendaw/studio-enums"
import {
    AudioBusBox,
    AudioUnitBox,
    NoteClipBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    TrackBox,
    ValueClipBox,
    ValueEventCollectionBox,
    ValueRegionBox
} from "@opendaw/studio-boxes"
import {
    AnyClipBox,
    AudioUnitBoxAdapter,
    DeviceHost,
    EffectDeviceBoxAdapter,
    EffectPointerType,
    IconSymbol,
    RootBoxAdapter,
    TrackClips,
    TrackRegions,
    TrackType
} from "@opendaw/studio-adapters"
import {Project} from "./Project"
import {InstrumentFactory} from "./InstrumentFactory"
import {InstrumentProduct} from "./InstrumentProduct"
import {InstrumentOptions} from "./InstrumentOptions"
import {EffectFactory} from "./EffectFactory"
import {ColorCodes} from "./ColorCodes"
import {ppqn, PPQN} from "@opendaw/lib-dsp"

export class ProjectApi {
    static readonly AudioUnitOrdering = {
        [AudioUnitType.Instrument]: 0,
        [AudioUnitType.Aux]: 1,
        [AudioUnitType.Bus]: 2,
        [AudioUnitType.Output]: 3
    } as const

    readonly #project: Project

    constructor(project: Project) {this.#project = project}

    createInstrument({create, defaultIcon, defaultName, trackType}: InstrumentFactory,
                     {name, icon, index}: InstrumentOptions = {}): InstrumentProduct {
        const {boxGraph, boxAdapters, rootBoxAdapter, userEditingManager} = this.#project
        const existingNames = rootBoxAdapter.audioUnits.adapters()
            .map(adapter => adapter.input.getValue().match({
                none: () => "Untitled",
                some: adapter => adapter.labelField.getValue()
            }))
        const audioUnitBox = this.#createAudioUnit(AudioUnitType.Instrument, index)
        const audioUnitBoxAdapter = boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter)
        const uniqueName = Strings.getUniqueName(existingNames, name ?? defaultName)
        const iconSymbol = icon ?? defaultIcon
        const instrumentBox = create(boxGraph, audioUnitBoxAdapter, uniqueName, iconSymbol)
        const trackBox = TrackBox.create(boxGraph, UUID.generate(), box => {
            box.index.setValue(0)
            box.type.setValue(trackType)
            box.tracks.refer(audioUnitBoxAdapter.tracksField)
            box.target.refer(audioUnitBoxAdapter.audioUnitBoxAdapter().box)
        })
        userEditingManager.audioUnit.edit(audioUnitBox.editing)
        return {audioUnitBox, instrumentBox, trackBox}
    }

    createEffect(host: DeviceHost, factory: EffectFactory, newIndex: int) {
        let chain: ReadonlyArray<EffectDeviceBoxAdapter>
        let field: Field<EffectPointerType>
        if (factory.type === "audio") {
            chain = host.audioEffects.adapters()
            field = host.audioEffects.field()
        } else if (factory.type === "midi") {
            chain = host.midiEffects.adapters()
            field = host.midiEffects.field()
        } else {
            return panic(`Unknown factory type: ${factory.type}`)
        }
        const box = factory.create(this.#project, field, newIndex)
        for (let index = newIndex; index < chain.length; index++) {
            chain[index].indexField.setValue(index + 1)
        }
        return box
    }

    createTrack(adapter: AudioUnitBoxAdapter, trackType: TrackType, index: int = 0): TrackBox {
        return TrackBox.create(this.#project.boxGraph, UUID.generate(), box => {
            box.index.setValue(index)
            box.type.setValue(trackType)
            box.tracks.refer(adapter.tracksField)
            box.target.refer(adapter.audioUnitBoxAdapter().box)
        })
    }

    createClip({collection, trackBoxAdapter}: TrackClips, clipIndex: int, {name}: {
        name?: string
    } = {}): Option<AnyClipBox> {
        if (collection.getAdapterByIndex(clipIndex).nonEmpty()) {
            console.warn("Cannot create Clip on occupied cell.")
            return Option.None
        }
        const {boxGraph} = this.#project
        const type = trackBoxAdapter.type
        switch (type) {
            case TrackType.Notes: {
                const events = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                return Option.wrap(NoteClipBox.create(boxGraph, UUID.generate(), box => {
                    box.index.setValue(clipIndex)
                    box.label.setValue(name ?? "Notes")
                    box.hue.setValue(ColorCodes.forTrackType(type))
                    box.mute.setValue(false)
                    box.duration.setValue(PPQN.Bar)
                    box.clips.refer(trackBoxAdapter.box.clips)
                    box.events.refer(events.owners)
                }))
            }
            case TrackType.Value: {
                const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
                return Option.wrap(ValueClipBox.create(boxGraph, UUID.generate(), box => {
                    box.index.setValue(clipIndex)
                    box.label.setValue(name ?? "CV")
                    box.hue.setValue(ColorCodes.forTrackType(type))
                    box.mute.setValue(false)
                    box.duration.setValue(PPQN.Bar)
                    box.events.refer(events.owners)
                    box.clips.refer(trackBoxAdapter.box.clips)
                }))
            }
        }
        return Option.None
    }

    createRegion({trackBoxAdapter}: TrackRegions, position: ppqn, duration: ppqn, {name}: { name?: string } = {}) {
        const {boxGraph} = this.#project
        const type = trackBoxAdapter.type
        switch (type) {
            case TrackType.Notes: {
                const events = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                return Option.wrap(NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                    box.position.setValue(Math.max(position, 0))
                    box.label.setValue(name ?? "Notes")
                    box.hue.setValue(ColorCodes.forTrackType(type))
                    box.mute.setValue(false)
                    box.duration.setValue(duration)
                    box.loopDuration.setValue(PPQN.Bar)
                    box.events.refer(events.owners)
                    box.regions.refer(trackBoxAdapter.box.regions)
                }))
            }
            case TrackType.Value: {
                const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
                return Option.wrap(ValueRegionBox.create(boxGraph, UUID.generate(), box => {
                    box.position.setValue(Math.max(position, 0))
                    box.label.setValue(name ?? "Automation")
                    box.hue.setValue(ColorCodes.forTrackType(type))
                    box.mute.setValue(false)
                    box.duration.setValue(duration)
                    box.loopDuration.setValue(PPQN.Bar)
                    box.events.refer(events.owners)
                    box.regions.refer(trackBoxAdapter.box.regions)
                }))
            }
        }
        return Option.None
    }

    createAudioBus(name: string,
                   icon: IconSymbol,
                   type: AudioUnitType,
                   color: string): AudioBusBox {
        console.debug(`createAudioBus '${name}', type: ${type}, color: ${color}`)
        const {rootBox, boxGraph} = this.#project
        assert(rootBox.audioBusses.isAttached(), "rootBox not attached")
        const uuid = UUID.generate()
        const audioBusBox = AudioBusBox.create(boxGraph, uuid, box => {
            box.collection.refer(rootBox.audioBusses)
            box.label.setValue(name)
            box.icon.setValue(IconSymbol.toName(icon))
            box.color.setValue(color)
        })
        const audioUnitBox = this.#createAudioUnit(type)
        TrackBox.create(boxGraph, UUID.generate(), box => {
            box.tracks.refer(audioUnitBox.tracks)
            box.target.refer(audioUnitBox)
            box.index.setValue(0)
            box.type.setValue(TrackType.Undefined)
        })
        audioBusBox.output.refer(audioUnitBox.input)
        return audioBusBox
    }

    deleteAudioUnit(adapter: AudioUnitBoxAdapter): void {
        const {rootBoxAdapter} = this.#project
        const adapters = rootBoxAdapter.audioUnits.adapters()
        const boxIndex = adapter.indexField.getValue()
        const deleteIndex = adapters.indexOf(adapter)
        console.debug(`deleteAudioUnit adapter: ${adapter.toString()}, deleteIndex: ${deleteIndex}, indexField: ${boxIndex}`)
        if (deleteIndex === -1) {return panic(`Cannot delete ${adapter}. Does not exist.`)}
        if (deleteIndex !== boxIndex) {
            console.debug("indices", adapters.map(x => x.box.index.getValue()).join(", "))
            return panic(`Cannot delete ${adapter}. Wrong index.`)
        }
        for (let index = deleteIndex + 1; index < adapters.length; index++) {
            adapters[index].indexField.setValue(index - 1)
        }
        adapter.box.delete()
    }

    #createAudioUnit(type: AudioUnitType, index?: int): AudioUnitBox {
        const {boxGraph, rootBox, rootBoxAdapter, masterBusBox} = this.#project
        const insertIndex = index ?? this.#pushAudioUnitsIndices(rootBoxAdapter, type, 1)
        console.debug(`createAudioUnit type: ${type}, insertIndex: ${insertIndex}`)
        return AudioUnitBox.create(boxGraph, UUID.generate(), box => {
            box.collection.refer(rootBox.audioUnits)
            box.output.refer(masterBusBox.input)
            box.index.setValue(insertIndex)
            box.type.setValue(type)
        })
    }

    #pushAudioUnitsIndices(rootBoxAdapter: RootBoxAdapter, type: AudioUnitType, count: int = 1): int {
        const adapters = rootBoxAdapter.audioUnits.adapters()
        const order: int = ProjectApi.AudioUnitOrdering[type]
        let index = 0 | 0
        for (; index < adapters.length; index++) {
            if (ProjectApi.AudioUnitOrdering[adapters[index].type] > order) {break}
        }
        const insertIndex = index
        while (index < adapters.length) {
            adapters[index].indexField.setValue(count + index++)
        }
        return insertIndex
    }
}