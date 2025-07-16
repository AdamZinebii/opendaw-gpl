import {int, panic, Strings, UUID} from "@opendaw/lib-std"
import {Field} from "@opendaw/lib-box"
import {AudioUnitType} from "@opendaw/studio-enums"
import {AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"
import {
    AudioUnitBoxAdapter,
    DeviceHost,
    EffectDeviceBoxAdapter,
    EffectPointerType,
    RootBoxAdapter,
    TrackType
} from "@opendaw/studio-adapters"
import {Project} from "./Project"
import {InstrumentFactory} from "./InstrumentFactory"
import {InstrumentProduct} from "./InstrumentProduct"
import {InstrumentOptions} from "./InstrumentOptions"
import {EffectFactory} from "./EffectFactory"

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

    createTrack(adapter: AudioUnitBoxAdapter, trackType: TrackType): TrackBox {
        return TrackBox.create(this.#project.boxGraph, UUID.generate(), box => {
            box.index.setValue(0)
            box.type.setValue(trackType)
            box.tracks.refer(adapter.tracksField)
            box.target.refer(adapter.audioUnitBoxAdapter().box)
        })
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