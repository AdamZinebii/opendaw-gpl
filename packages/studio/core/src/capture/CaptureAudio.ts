import {assert, Option, Terminable} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {RecordAudio} from "./RecordAudio"
import {RecordingContext} from "./RecordingContext"

export class CaptureAudio extends Capture {
    #stream: Option<MediaStream> = Option.None

    constructor(box: AudioUnitBox) {super(box)}

    async prepareRecording({audioContext: {sampleRate}}: RecordingContext): Promise<void> {
        return navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: undefined, // TODO
                sampleRate,
                sampleSize: 32,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        })
            .then(stream => this.#stream = Option.wrap(stream))
            .then()
    }

    startRecording({audioContext, worklets, project, engine, sampleManager}: RecordingContext): Terminable {
        assert(this.#stream.nonEmpty(), "Stream not prepared.")
        const mediaStream = this.#stream.unwrap()
        return RecordAudio.start({
            recordingWorklet: worklets.createRecording(2, 128, audioContext.outputLatency),
            mediaStream,
            sampleManager,
            audioContext,
            engine,
            project,
            capture: this
        })
    }
}