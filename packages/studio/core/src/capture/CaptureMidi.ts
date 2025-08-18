import {assert, Option, Terminable} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordMidi} from "./RecordMidi"
import {RecordingContext} from "./RecordingContext"

export class CaptureMidi extends Capture {
    #midiAccess: Option<MIDIAccess> = Option.None

    constructor(box: AudioUnitBox) {super(box)}

    async prepareRecording({requestMIDIAccess}: RecordingContext): Promise<void> {
        return requestMIDIAccess()
            .then(access => this.#midiAccess = Option.wrap(access))
            .then()
    }

    startRecording({project, engine}: RecordingContext): Terminable {
        assert(this.#midiAccess.nonEmpty(), "Stream not prepared.")
        const midiAccess = this.#midiAccess.unwrap()
        return RecordMidi.start({
            midiAccess,
            engine,
            project,
            capture: this
        })
    }
}