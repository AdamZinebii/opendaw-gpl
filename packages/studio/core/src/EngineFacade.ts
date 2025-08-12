import {
    byte,
    DefaultObservableValue,
    int,
    MutableObservableValue,
    Nullable,
    ObservableValue,
    Observer,
    Option,
    Subscription,
    Terminator,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {ClipNotification} from "@opendaw/studio-adapters"
import {Engine} from "./Engine"
import {EngineWorklet} from "./EngineWorklet"

export class EngineFacade implements Engine {
    readonly #terminator: Terminator = new Terminator()
    readonly #lifecycle: Terminator = this.#terminator.own(new Terminator())
    readonly #playbackTimestamp: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #position: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #isPlaying: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isRecording: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #metronomeEnabled: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #markerState: DefaultObservableValue<Nullable<[UUID.Format, int]>> =
        new DefaultObservableValue<Nullable<[UUID.Format, int]>>(null)

    #client: Option<EngineWorklet> = Option.None

    constructor() {
        this.#blockBooleanWhenNoClient(this.#isPlaying)
        this.#blockBooleanWhenNoClient(this.#isRecording)
    }

    setClient(client: EngineWorklet) {
        this.#client = Option.wrap(client)
        this.#lifecycle.terminate()
        this.#lifecycle.ownAll(
            client.playbackTimestamp().catchupAndSubscribe(owner => this.#playbackTimestamp.setValue(owner.getValue())),
            client.position().catchupAndSubscribe(owner => this.#position.setValue(owner.getValue())),
            client.isPlaying().catchupAndSubscribe(owner => this.#isPlaying.setValue(owner.getValue())),
            client.isRecording().catchupAndSubscribe(owner => this.#isRecording.setValue(owner.getValue())),
            client.metronomeEnabled().catchupAndSubscribe(owner => this.#metronomeEnabled.setValue(owner.getValue())),
            client.markerState().catchupAndSubscribe(owner => this.#markerState.setValue(owner.getValue())),
            this.position().catchupAndSubscribe(owner => client.position().setValue(owner.getValue())),
            this.isPlaying().catchupAndSubscribe(owner => client.isPlaying().setValue(owner.getValue())),
            this.isRecording().catchupAndSubscribe(owner => client.isRecording().setValue(owner.getValue())),
            this.metronomeEnabled().catchupAndSubscribe(owner => client.metronomeEnabled().setValue(owner.getValue()))
        )
    }

    playbackTimestamp(): MutableObservableValue<ppqn> {return this.#playbackTimestamp}
    position(): ObservableValue<ppqn> {return this.#position}
    isPlaying(): MutableObservableValue<boolean> {return this.#isPlaying}
    isRecording(): MutableObservableValue<boolean> {return this.#isRecording}
    metronomeEnabled(): MutableObservableValue<boolean> {return this.#metronomeEnabled}
    markerState(): DefaultObservableValue<Nullable<[UUID.Format, int]>> {return this.#markerState}
    isReady(): Promise<void> {return this.#client.mapOr(client => client.isReady(), Promise.resolve())}
    queryLoadingComplete(): Promise<boolean> {
        return this.#client.mapOr(client => client.queryLoadingComplete(), Promise.resolve(false))
    }
    stop(): void {this.#client.ifSome(client => client.stop())}
    panic(): void {this.#client.ifSome(client => client.panic())}
    sampleRate(): number {return this.#client.isEmpty() ? 44_100 : this.#client.unwrap().context.sampleRate}
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription {
        return this.#client.unwrap().subscribeClipNotification(observer)
    }
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void {
        this.#client.unwrap("No engine").noteOn(uuid, pitch, velocity)
    }
    noteOff(uuid: UUID.Format, pitch: byte): void {this.#client.unwrap("No engine").noteOff(uuid, pitch)}
    scheduleClipPlay(...clipIds: ReadonlyArray<UUID.Format>): void {
        this.#client.unwrap("No engine").scheduleClipPlay(...clipIds)
    }
    scheduleClipStop(...trackIds: ReadonlyArray<UUID.Format>): void {
        this.#client.unwrap("No engine").scheduleClipStop(...trackIds)
    }
    requestPosition(position: ppqn): void {
        this.#client.unwrap("No engine").requestPosition(position)
    }

    terminate(): void {
        this.#terminator.terminate()
        this.#client.ifSome(client => client.terminate())
        this.#client = Option.None
    }

    #blockBooleanWhenNoClient(value: DefaultObservableValue<boolean>): void {
        this.#terminator.own(value.subscribe(owner => {
            if (this.#client.isEmpty() && owner.getValue()) {
                value.setValue(false)
            }
        }))
    }
}