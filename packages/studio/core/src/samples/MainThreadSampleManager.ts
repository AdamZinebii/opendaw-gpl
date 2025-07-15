import {ProgressHandler, SortedSet, UUID} from "@opendaw/lib-std"
import {AudioData, SampleManager, SampleMetaData} from "@opendaw/studio-adapters"
import {MainThreadSampleLoader} from "./MainThreadSampleLoader"
import {SampleProvider} from "./SampleProvider"

export class MainThreadSampleManager implements SampleManager, SampleProvider {
    readonly #api: SampleProvider
    readonly #context: AudioContext
    readonly #loaders: SortedSet<UUID.Format, MainThreadSampleLoader>

    constructor(api: SampleProvider, context: AudioContext) {
        this.#api = api
        this.#context = context
        this.#loaders = UUID.newSet(loader => loader.uuid)
    }

    get context(): AudioContext {return this.#context}

    fetch(uuid: UUID.Format, progress: ProgressHandler): Promise<[AudioData, SampleMetaData]> {
        return this.#api.fetch(uuid, progress)
    }

    invalidate(uuid: UUID.Format) {this.#loaders.opt(uuid).ifSome(loader => loader.invalidate())}

    getOrCreate(uuid: UUID.Format): MainThreadSampleLoader {
        return this.#loaders.getOrCreate(uuid, uuid => new MainThreadSampleLoader(this, uuid))
    }
}