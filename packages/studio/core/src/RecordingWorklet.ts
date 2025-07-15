import {EmptyExec} from "@opendaw/lib-std"
import {Files} from "@opendaw/lib-dom"
import {mergeChunkPlanes, RingBuffer} from "@opendaw/studio-adapters"
import {encodeWavFloat} from "./Wav"
import {RenderQuantum} from "./RenderQuantum"

export class RecordingWorklet extends AudioWorkletNode {
    readonly #reader: RingBuffer.Reader

    constructor(context: BaseAudioContext, config: RingBuffer.Config) {
        super(context, "recording-processor", {
            numberOfInputs: 1,
            channelCount: config.numberOfChannels,
            channelCountMode: "explicit",
            processorOptions: config
        })
        const sampleRate = this.context.sampleRate
        const output: Array<Array<Float32Array>> = []
        const seconds = 3.1452
        const numFrames = Math.ceil(sampleRate * seconds)
        console.debug(`numFrames: ${numFrames}`)
        this.#reader = RingBuffer.reader(config, array => {
            output.push(array)
            if (output.length * RenderQuantum >= numFrames) {
                this.#reader.stop()
                const channels = mergeChunkPlanes(output, numFrames)
                const wav = encodeWavFloat({channels, numFrames, sampleRate})
                Files.save(wav, {suggestedName: "recording.wav"})
                    .then(() => console.debug("WAV saved"), EmptyExec)
            }
        })
    }
}