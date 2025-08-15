import {assert, Option, Terminable, Terminator} from "@opendaw/lib-std"
import {Worklets} from "../Worklets"
import {Project} from "../Project"
import {Engine} from "../Engine"
import {RecordMidi} from "./RecordMidi"
import {SampleManager} from "@opendaw/studio-adapters"
import {RecordAudio} from "./RecordAudio"

export interface RecordingContext {
    project: Project
    worklets: Worklets
    engine: Engine
    audioContext: AudioContext
    sampleManager: SampleManager
    midiAccess: Option<MIDIAccess>
}

// TODO Recording
//  Mute recorded content
//  Add RecordAudio

export class Recording {
    static start(context: RecordingContext): void {
        assert(this.#instance.isEmpty(), "Recording already in progress")
        this.#instance = Option.wrap(new Recording(context))
    }

    static #instance: Option<Recording> = Option.None

    private constructor(readonly context: RecordingContext) {
        const {engine, project, midiAccess, audioContext} = this.context
        const {captureManager, editing, sampleManager} = project
        const terminator = new Terminator()
        engine.startRecording()
        captureManager.filterArmed().forEach(capture => {
            const input = capture.box.input.pointerHub.incoming()[0].box
            // TODO Test for audio or notes. We assume MIDI for now.
            const audio = true
            if (audio) {
                terminator.own(RecordAudio.start({
                    sampleManager,
                    audioContext,
                    capture,
                    engine,
                    project
                }))
            }
            if (midiAccess.isEmpty()) {return}
            const midi = false
            if (midi) {
                terminator.own(RecordMidi.start({
                    midi: midiAccess.unwrap(),
                    capture,
                    engine,
                    project
                }))
            }
        })
        const {isRecording, isCountingIn} = engine
        const stop = (): void => {
            if (isRecording.getValue() || isCountingIn.getValue()) {return}
            editing.mark()
            terminator.terminate()
        }
        terminator.ownAll(
            engine.isRecording.subscribe(stop),
            engine.isCountingIn.subscribe(stop),
            Terminable.create(() => Recording.#instance = Option.None)
        )
    }
}