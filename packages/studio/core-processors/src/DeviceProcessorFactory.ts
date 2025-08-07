import {
    ArpeggioDeviceBox,
    AudioBusBox,
    BoxVisitor,
    DelayDeviceBox,
    ModularDeviceBox,
    NanoDeviceBox,
    PitchDeviceBox,
    PlayfieldDeviceBox,
    RevampDeviceBox,
    ReverbDeviceBox,
    StereoToolDeviceBox,
    TapeDeviceBox,
    UnknownAudioEffectDeviceBox,
    UnknownMidiEffectDeviceBox,
    VaporisateurDeviceBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {DelayDeviceProcessor} from "./devices/audio-effects/DelayDeviceProcessor"
import {
    ArpeggioDeviceBoxAdapter,
    AudioBusBoxAdapter,
    DelayDeviceBoxAdapter,
    ModularDeviceBoxAdapter,
    NanoDeviceBoxAdapter,
    PitchDeviceBoxAdapter,
    PlayfieldDeviceBoxAdapter,
    RevampDeviceBoxAdapter,
    ReverbDeviceBoxAdapter,
    StereoToolDeviceBoxAdapter,
    TapeDeviceBoxAdapter,
    UnknownAudioEffectDeviceBoxAdapter,
    UnknownMidiEffectDeviceBoxAdapter,
    VaporisateurDeviceBoxAdapter,
    ZeitgeistDeviceBoxAdapter
} from "@opendaw/studio-adapters"
import {NopDeviceProcessor} from "./devices/audio-effects/NopDeviceProcessor"
import {asDefined, Nullish} from "@opendaw/lib-std"
import {EngineContext} from "./EngineContext"
import {Box} from "@opendaw/lib-box"
import {AudioBusProcessor} from "./AudioBusProcessor"
import {VaporisateurDeviceProcessor} from "./devices/instruments/VaporisateurDeviceProcessor"
import {TapeDeviceProcessor} from "./devices/instruments/TapeDeviceProcessor"
import {ArpeggioDeviceProcessor} from "./devices/midi-effects/ArpeggioDeviceProcessor"
import {PitchDeviceProcessor} from "./devices/midi-effects/PitchDeviceProcessor"
import {RevampDeviceProcessor} from "./devices/audio-effects/RevampDeviceProcessor"
import {ReverbDeviceProcessor} from "./devices/audio-effects/ReverbDeviceProcessor"
import {NanoDeviceProcessor} from "./devices/instruments/NanoDeviceProcessor"
import {PlayfieldDeviceProcessor} from "./devices/instruments/PlayfieldDeviceProcessor"
import {StereoToolDeviceProcessor} from "./devices/audio-effects/StereoToolDeviceProcessor"
import {ZeitgeistDeviceProcessor} from "./devices/midi-effects/ZeitgeistDeviceProcessor"
import {MidiEffectProcessor} from "./MidiEffectProcessor"
import {InstrumentDeviceProcessor} from "./InstrumentDeviceProcessor"
import {AudioEffectDeviceProcessor} from "./AudioEffectDeviceProcessor"
import {UnknownMidiEffectDeviceProcessor} from "./devices/midi-effects/UnknownMidiEffectDeviceProcessor"

export namespace InstrumentDeviceProcessorFactory {
    export const create = (context: EngineContext,
                           box: Box): Nullish<InstrumentDeviceProcessor | AudioBusProcessor> =>
        box.accept<BoxVisitor<InstrumentDeviceProcessor | AudioBusProcessor>>({
            visitAudioBusBox: (box: AudioBusBox) =>
                new AudioBusProcessor(context, context.boxAdapters.adapterFor(box, AudioBusBoxAdapter)),
            visitVaporisateurDeviceBox: (box: VaporisateurDeviceBox) =>
                new VaporisateurDeviceProcessor(context, context.boxAdapters.adapterFor(box, VaporisateurDeviceBoxAdapter)),
            visitNanoDeviceBox: (box: NanoDeviceBox) =>
                new NanoDeviceProcessor(context, context.boxAdapters.adapterFor(box, NanoDeviceBoxAdapter)),
            visitTapeDeviceBox: (box: TapeDeviceBox) =>
                new TapeDeviceProcessor(context, context.boxAdapters.adapterFor(box, TapeDeviceBoxAdapter)),
            visitPlayfieldDeviceBox: (box: PlayfieldDeviceBox) =>
                new PlayfieldDeviceProcessor(context, context.boxAdapters.adapterFor(box, PlayfieldDeviceBoxAdapter))
        })
}

export namespace MidiEffectDeviceProcessorFactory {
    export const create = (context: EngineContext,
                           box: Box): MidiEffectProcessor =>
        asDefined(box.accept<BoxVisitor<MidiEffectProcessor>>({
            visitUnknownMidiEffectDeviceBox: (box: UnknownMidiEffectDeviceBox): MidiEffectProcessor =>
                new UnknownMidiEffectDeviceProcessor(context, context.boxAdapters.adapterFor(box, UnknownMidiEffectDeviceBoxAdapter)),
            visitArpeggioDeviceBox: (box: ArpeggioDeviceBox): MidiEffectProcessor =>
                new ArpeggioDeviceProcessor(context, context.boxAdapters.adapterFor(box, ArpeggioDeviceBoxAdapter)),
            visitPitchDeviceBox: (box: PitchDeviceBox): MidiEffectProcessor =>
                new PitchDeviceProcessor(context, context.boxAdapters.adapterFor(box, PitchDeviceBoxAdapter)),
            visitZeitgeistDeviceBox: (box: ZeitgeistDeviceBox): MidiEffectProcessor =>
                new ZeitgeistDeviceProcessor(context, context.boxAdapters.adapterFor(box, ZeitgeistDeviceBoxAdapter))
        }), `Could not create midi-effect for'${box.name}'`)
}

export namespace AudioEffectDeviceProcessorFactory {
    export const create = (context: EngineContext,
                           box: Box): AudioEffectDeviceProcessor =>
        asDefined(box.accept<BoxVisitor<AudioEffectDeviceProcessor>>({
            visitUnknownAudioEffectDeviceBox: (box: UnknownAudioEffectDeviceBox): AudioEffectDeviceProcessor =>
                new NopDeviceProcessor(context, context.boxAdapters.adapterFor(box, UnknownAudioEffectDeviceBoxAdapter)),
            visitStereoToolDeviceBox: (box: StereoToolDeviceBox): AudioEffectDeviceProcessor =>
                new StereoToolDeviceProcessor(context, context.boxAdapters.adapterFor(box, StereoToolDeviceBoxAdapter)),
            visitDelayDeviceBox: (box: DelayDeviceBox): AudioEffectDeviceProcessor =>
                new DelayDeviceProcessor(context, context.boxAdapters.adapterFor(box, DelayDeviceBoxAdapter)),
            visitReverbDeviceBox: (box: ReverbDeviceBox): AudioEffectDeviceProcessor =>
                new ReverbDeviceProcessor(context, context.boxAdapters.adapterFor(box, ReverbDeviceBoxAdapter)),
            visitRevampDeviceBox: (box: RevampDeviceBox): AudioEffectDeviceProcessor =>
                new RevampDeviceProcessor(context, context.boxAdapters.adapterFor(box, RevampDeviceBoxAdapter)),
            visitModularDeviceBox: (box: ModularDeviceBox): AudioEffectDeviceProcessor =>
                new NopDeviceProcessor(context, context.boxAdapters.adapterFor(box, ModularDeviceBoxAdapter))
        }), `Could not create audio-effect for'${box.name}'`)
}