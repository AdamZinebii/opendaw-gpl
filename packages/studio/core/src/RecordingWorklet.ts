import {
    ByteArrayInput,
    int,
    isUndefined,
    Notifier,
    Observer,
    Option,
    Subscription,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {
    AudioData,
    mergeChunkPlanes,
    RingBuffer,
    SampleLoader,
    SampleLoaderState,
    SampleMetaData
} from "@opendaw/studio-adapters"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {RenderQuantum} from "./RenderQuantum"
import {WorkerAgents} from "./WorkerAgents"
import {SampleStorage} from "./samples/SampleStorage"
import {BPMTools} from "@opendaw/lib-dsp"

export class RecordingWorklet extends AudioWorkletNode implements Terminable, SampleLoader {
    readonly uuid: UUID.Format = UUID.generate()

    readonly #output: Array<ReadonlyArray<Float32Array>>
    readonly #notifier: Notifier<SampleLoaderState>
    readonly #reader: RingBuffer.Reader

    #data: Option<AudioData> = Option.None
    #peaks: Option<Peaks> = Option.None
    #isRecording: boolean = true
    #truncateLatency: int
    #state: SampleLoaderState = {type: "record"}

    constructor(context: BaseAudioContext, config: RingBuffer.Config, outputLatency: number) {
        super(context, "recording-processor", {
            numberOfInputs: 1,
            channelCount: config.numberOfChannels,
            channelCountMode: "explicit",
            processorOptions: config
        })

        if (isUndefined(outputLatency)) {
            // TODO Talk to the user
            console.warn("outputLatency is undefined. Please use Chrome.")
        }

        this.#truncateLatency = Math.floor((outputLatency ?? 0) * this.context.sampleRate / RenderQuantum)
        this.#output = []
        this.#notifier = new Notifier<SampleLoaderState>()
        this.#reader = RingBuffer.reader(config, array => {
            if (this.#isRecording) {
                if (this.#truncateLatency === 0) {
                    this.#output.push(array)
                } else {
                    this.#truncateLatency--
                }
            }
        })
    }

    get numberOfFrames(): int {return this.#output.length * RenderQuantum}
    get data(): Option<AudioData> {return this.#data}
    get peaks(): Option<Peaks> {return this.#peaks}
    get state(): SampleLoaderState {return this.#state}

    invalidate(): void {}

    subscribe(observer: Observer<SampleLoaderState>): Subscription {
        if (this.#state.type === "loaded") {
            observer(this.#state)
            return Terminable.Empty
        }
        return this.#notifier.subscribe(observer)
    }

    async finalize() {
        this.#reader.stop()
        this.#isRecording = false
        const sample_rate = this.context.sampleRate
        const numberOfFrames = this.#output.length * RenderQuantum
        const numberOfChannels = this.channelCount
        const frames = mergeChunkPlanes(this.#output, RenderQuantum, numberOfFrames)
        const audioData: AudioData = {
            sampleRate: sample_rate,
            numberOfChannels,
            numberOfFrames,
            frames
        }
        this.#data = Option.wrap(audioData)
        const shifts = SamplePeaks.findBestFit(numberOfFrames)
        const peaks = await WorkerAgents.Peak
            .generateAsync(progress => this.#setState({
                type: "progress",
                progress
            }), shifts, frames, numberOfFrames, numberOfChannels)
        this.#peaks = Option.wrap(SamplePeaks.from(new ByteArrayInput(peaks)))
        const bpm = BPMTools.detect(frames[0], sample_rate)
        const duration = numberOfFrames / sample_rate
        const meta: SampleMetaData = {name: "Recording", bpm, sample_rate, duration}
        await SampleStorage.store(this.uuid, audioData, peaks as ArrayBuffer, meta)
        this.#setState({type: "loaded"})
    }

    terminate(): void {
        this.#reader.stop()
        this.#isRecording = false
    }

    toString(): string {return `{RecordingWorklet}`}

    #setState(value: SampleLoaderState): void {
        this.#state = value
        this.#notifier.notify(this.#state)
    }
}