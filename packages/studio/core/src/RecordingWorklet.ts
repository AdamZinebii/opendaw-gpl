import {
    ByteArrayInput,
    int,
    isUndefined,
    Notifier,
    Observer,
    Option,
    SilentProgressHandler,
    Subscription,
    Terminable,
    UUID
} from "@opendaw/lib-std"
import {AudioData, mergeChunkPlanes, RingBuffer, SampleLoader, SampleLoaderState} from "@opendaw/studio-adapters"
import {Peaks, SamplePeaks} from "@opendaw/lib-fusion"
import {RenderQuantum} from "./RenderQuantum"
import {WorkerAgents} from "./WorkerAgents"

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

    terminate(): void {
        this.#reader.stop()
        this.#isRecording = false
        const sampleRate = this.context.sampleRate
        const numberOfFrames = this.#output.length * RenderQuantum
        const numberOfChannels = this.channelCount
        const frames = mergeChunkPlanes(this.#output, RenderQuantum, numberOfFrames)
        this.#data = Option.wrap({
            sampleRate,
            numberOfChannels,
            numberOfFrames,
            frames
        })

        // TODO Generate Peaks
        const shifts = SamplePeaks.findBestFit(numberOfFrames)
        WorkerAgents.Peak.generateAsync(SilentProgressHandler, shifts, frames, numberOfFrames, numberOfChannels)
            .then(peaks => this.#peaks = Option.wrap(SamplePeaks.from(new ByteArrayInput(peaks))))
            .then(() => this.#setState({type: "loaded"}))
    }

    toString(): string {return `{RecordingWorklet}`}

    #setState(value: SampleLoaderState): void {
        this.#state = value
        this.#notifier.notify(this.#state)
    }
}