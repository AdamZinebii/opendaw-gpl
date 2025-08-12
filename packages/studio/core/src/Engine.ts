import {ppqn} from "@opendaw/lib-dsp"
import {
    byte,
    DefaultObservableValue,
    int,
    MutableObservableValue,
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
    position(): ObservableValue<ppqn>
    isPlaying(): ObservableValue<boolean>
    isRecording(): ObservableValue<boolean>
    metronomeEnabled(): ObservableValue<boolean>
    playbackTimestamp(): MutableObservableValue<ppqn>
    isReady(): Promise<void>
    queryLoadingComplete(): Promise<boolean>
    stop(): void
    panic(): void
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void
    noteOff(uuid: UUID.Format, pitch: byte): void
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription
    markerState(): DefaultObservableValue<Nullable<[UUID.Format, int]>>
}