import {int, Notifier, Observer, Option, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {Peaks} from "@opendaw/lib-fusion"
import {AudioData, SampleLoader, SampleLoaderState} from "@opendaw/studio-adapters"
import {SampleApi} from "./SampleApi"

export class MainThreadAudioLoader implements SampleLoader {
    readonly #context: AudioContext
    readonly #uuid: UUID.Format
    readonly #notifier: Notifier<SampleLoaderState>

    #data: Option<AudioData> = Option.None
    #state: SampleLoaderState = {type: "progress", progress: 0.0}
    #version: int = 0

    constructor(context: AudioContext, uuid: UUID.Format) {
        this.#context = context
        this.#uuid = uuid

        this.#notifier = new Notifier<SampleLoaderState>()
        this.#get()
    }

    invalidate(): void {
        this.#state = {type: "progress", progress: 0.0}
        this.#data = Option.None
        this.#version++
        this.#get()
    }

    subscribe(observer: Observer<SampleLoaderState>): Subscription {
        if (this.#state.type === "loaded") {
            observer(this.#state)
            return Terminable.Empty
        }
        return this.#notifier.subscribe(observer)
    }

    get uuid(): UUID.Format {return this.#uuid}
    get data(): Option<AudioData> {return this.#data}
    get peaks(): Option<Peaks> {return Option.None}
    get state(): SampleLoaderState {return this.#state}

    #setState(value: SampleLoaderState): void {
        this.#state = value
        this.#notifier.notify(this.#state)
    }

    #get(): void {
        console.debug("GET", UUID.toString(this.#uuid))
        SampleApi.load(this.#context, this.#uuid, progress => this.#setState({type: "progress", progress}))
            .then(([data]) => {
                console.debug("LOADED", UUID.toString(this.#uuid))
                this.#data = Option.wrap(data)
                this.#setState({type: "loaded"})
            }, reason => this.#setState({type: "error", reason}))
    }
}