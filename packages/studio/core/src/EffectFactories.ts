import {INVERSE_SQRT_2, UUID} from "@opendaw/lib-std"
import {
    ArpeggioDeviceBox,
    DelayDeviceBox,
    GrooveShuffleBox,
    ModularAudioInputBox,
    ModularAudioOutputBox,
    ModularBox,
    ModularDeviceBox,
    ModuleConnectionBox,
    PitchDeviceBox,
    RevampDeviceBox,
    ReverbDeviceBox,
    StereoToolDeviceBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {IconSymbol} from "@opendaw/studio-adapters"
import {EffectFactory} from "./EffectFactory"

export namespace EffectFactories {
    export const Arpeggio: EffectFactory = {
        defaultName: "Arpeggio",
        defaultIcon: IconSymbol.Stack,
        description: "Generates rhythmic note sequences from chords",
        separatorBefore: false,
        type: "midi",
        create: ({boxGraph}, unit, index) => ArpeggioDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue("Arpeggio")
            box.index.setValue(index)
            box.host.refer(unit)
        })
    }

    export const Pitch: EffectFactory = {
        defaultName: "Pitch",
        defaultIcon: IconSymbol.Note,
        description: "Shifts the pitch of incoming notes",
        separatorBefore: false,
        type: "midi",
        create: ({boxGraph}, unit, index) => PitchDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue("Pitch")
            box.index.setValue(index)
            box.host.refer(unit)
        })
    }

    export const Zeitgeist: EffectFactory = {
        defaultName: "Zeitgeist",
        defaultIcon: IconSymbol.Zeitgeist,
        description: "Distorts space and time",
        separatorBefore: false,
        type: "midi",
        create: ({boxGraph, rootBoxAdapter}, unit, index): ZeitgeistDeviceBox => {
            const useGlobal = false // TODO First Zeitgeist should be true
            const shuffleBox = useGlobal
                ? rootBoxAdapter.groove.box
                : GrooveShuffleBox.create(boxGraph, UUID.generate(), box => {
                    box.label.setValue("Shuffle")
                    box.duration.setValue(480)
                })
            return ZeitgeistDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Zeitgeist")
                box.groove.refer(shuffleBox)
                box.index.setValue(index)
                box.host.refer(unit)
            })
        }
    }

    export const StereoTool: EffectFactory = {
        defaultName: "Stereo Tool",
        defaultIcon: IconSymbol.Stereo,
        description: "Computes a stereo transformation matrix with volume, panning, phase inversion and stereo width.",
        separatorBefore: false,
        type: "audio",
        create: ({boxGraph}, unit, index): StereoToolDeviceBox =>
            StereoToolDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Stereo Tool")
                box.index.setValue(index)
                box.host.refer(unit)
            })
    }

    export const Delay: EffectFactory = {
        defaultName: "Delay",
        defaultIcon: IconSymbol.Time,
        description: "Echoes the input signal with time-based repeats",
        separatorBefore: false,
        type: "audio",
        create: ({boxGraph}, unit, index): DelayDeviceBox =>
            DelayDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Delay")
                box.index.setValue(index)
                box.host.refer(unit)
            })
    }

    export const Reverb: EffectFactory = {
        defaultName: "Reverb",
        defaultIcon: IconSymbol.Cube,
        description: "Simulates space and depth with reflections",
        separatorBefore: false,
        type: "audio",
        create: ({boxGraph}, unit, index): ReverbDeviceBox =>
            ReverbDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Reverb")
                box.preDelay.setInitValue(0.001)
                box.index.setValue(index)
                box.host.refer(unit)
            })
    }

    export const Revamp: EffectFactory = {
        defaultName: "Revamp",
        defaultIcon: IconSymbol.EQ,
        description: "Shapes the frequency balance of the sound",
        separatorBefore: false,
        type: "audio",
        create: ({boxGraph}, unit, index): RevampDeviceBox =>
            RevampDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Revamp")
                box.highPass.frequency.setInitValue(40.0)
                box.highPass.order.setInitValue(2)
                box.highPass.q.setInitValue(INVERSE_SQRT_2)
                box.highPass.enabled.setInitValue(true)
                box.lowShelf.frequency.setInitValue(80.0)
                box.lowShelf.gain.setInitValue(6)
                box.lowBell.frequency.setInitValue(120.0)
                box.lowBell.gain.setInitValue(6)
                box.lowBell.q.setInitValue(INVERSE_SQRT_2)
                box.midBell.frequency.setInitValue(640.0)
                box.midBell.q.setInitValue(INVERSE_SQRT_2)
                box.midBell.gain.setInitValue(6)
                box.highBell.frequency.setInitValue(3600.0)
                box.highBell.q.setInitValue(INVERSE_SQRT_2)
                box.highBell.gain.setInitValue(6)
                box.highShelf.frequency.setInitValue(10000.0)
                box.highShelf.gain.setInitValue(6)
                box.lowPass.frequency.setInitValue(15000.0)
                box.lowPass.order.setInitValue(2)
                box.lowPass.q.setInitValue(INVERSE_SQRT_2)
                box.index.setValue(index)
                box.host.refer(unit)
            })
    }

    export const Modular: EffectFactory = {
        defaultName: "🔇 Create New Modular Audio Effect (inaudible yet)",
        defaultIcon: IconSymbol.Box,
        description: "",
        separatorBefore: true,
        type: "audio",
        create: ({boxGraph, rootBox, userEditingManager}, unit, index): ModularDeviceBox => {
            const moduleSetupBox = ModularBox.create(boxGraph, UUID.generate(), box => {
                box.collection.refer(rootBox.modularSetups)
                box.label.setValue("Modular")
            })
            const modularInput = ModularAudioInputBox.create(boxGraph, UUID.generate(), box => {
                box.attributes.collection.refer(moduleSetupBox.modules)
                box.attributes.label.setValue("Modular Input")
                box.attributes.x.setValue(-256)
                box.attributes.y.setValue(32)
            })
            const modularOutput = ModularAudioOutputBox.create(boxGraph, UUID.generate(), box => {
                box.attributes.collection.refer(moduleSetupBox.modules)
                box.attributes.label.setValue("Modular Output")
                box.attributes.x.setValue(256)
                box.attributes.y.setValue(32)
            })
            ModuleConnectionBox.create(boxGraph, UUID.generate(), box => {
                box.collection.refer(moduleSetupBox.connections)
                box.source.refer(modularInput.output)
                box.target.refer(modularOutput.input)
            })
            userEditingManager.modularSystem.edit(moduleSetupBox.editing)
            return ModularDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Modular")
                box.modularSetup.refer(moduleSetupBox.device)
                box.index.setValue(index)
                box.host.refer(unit)
            })
        }
    }

    export const MidiNamed = {Arpeggio, Pitch, Zeitgeist}
    export const AudioNamed = {StereoTool, Delay, Reverb, Revamp, Modular}
    export const MidiList: ReadonlyArray<Readonly<EffectFactory>> = Object.values(MidiNamed)
    export const AudioList: ReadonlyArray<Readonly<EffectFactory>> = Object.values(AudioNamed)
    export const MergedNamed = {...MidiNamed, ...AudioNamed}
    export type MidiEffectKeys = keyof typeof MidiNamed
    export type AudioEffectKeys = keyof typeof AudioNamed
}