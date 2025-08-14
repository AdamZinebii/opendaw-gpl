import {assert, Option} from "@opendaw/lib-std"
import {Worklets} from "../Worklets"
import {Project} from "../Project"
import {Engine} from "../Engine"
import {RecordMidi} from "./RecordMidi"

export interface RecordingContext {
    project: Project
    worklets: Worklets
    engine: Engine
    audioContext: AudioContext
    midiAccess: Option<MIDIAccess>
}

export class Recording {
    static start(context: RecordingContext): void {
        assert(this.#instance.isEmpty(), "Recording already in progress")
        this.#instance = Option.wrap(new Recording(context)) // TODO How to reset
    }

    static #instance: Option<Recording> = Option.None

    private constructor(readonly context: RecordingContext) {
        const {engine, project, midiAccess} = this.context
        engine.startRecording()
        project.captureManager.filterArmed().forEach(capture => {
            const input = capture.box.input.pointerHub.incoming()[0].box
            // TODO Test for audio or notes. We assume MIDI for now.
            if (midiAccess.isEmpty()) {return}
            RecordMidi.start({
                midi: midiAccess.unwrap(),
                capture,
                engine,
                project
            })
        })
    }
}