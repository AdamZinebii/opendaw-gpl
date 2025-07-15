import {SortedSet, UUID} from "@opendaw/lib-std"
import {SampleLoader, SampleManager} from "@opendaw/studio-adapters"
import {MainThreadAudioLoader} from "./MainThreadAudioLoader"

export class MainThreadAudioLoaderManager implements SampleManager {
    readonly #context: AudioContext
    readonly #loaders: SortedSet<UUID.Format, MainThreadAudioLoader>

    constructor(context: AudioContext) {
        this.#context = context
        this.#loaders = UUID.newSet(loader => loader.uuid)
    }

    getOrCreate(uuid: UUID.Format): SampleLoader {
        return this.#loaders.getOrCreate(uuid, uuid => new MainThreadAudioLoader(this.#context, uuid))
    }

    invalidate(_uuid: UUID.Format): void {}
}