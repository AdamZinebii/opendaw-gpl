import {ppqn} from "@opendaw/lib-dsp"
import {
    byte,
    int,
    Nullable,
    ObservableValue,
    Observer,
    Subscription,
    Terminable,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {ClipNotification} from "@opendaw/studio-adapters"

export interface Engine extends Terminable {
    play(): void
    stop(): void
    setPosition(position: ppqn): void
    startRecording(): void
    stopRecording(): void
    isReady(): Promise<void>
    queryLoadingComplete(): Promise<boolean>
    stop(): void
    panic(): void
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void
    noteOff(uuid: UUID.Format, pitch: byte): void
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription

    get position(): ObservableValue<ppqn>
    get isPlaying(): ObservableValue<boolean>
    get isRecording(): ObservableValue<boolean>
    get metronomeEnabled(): ObservableValue<boolean>
    get playbackTimestamp(): ObservableValue<ppqn>
    get countInBeatsRemaining(): ObservableValue<int>
    get markerState(): ObservableValue<Nullable<[UUID.Format, int]>>
}