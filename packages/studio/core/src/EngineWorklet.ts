import {
    Arrays,
    byte,
    DefaultObservableValue,
    int,
    MutableObservableValue,
    Notifier,
    Nullable,
    ObservableValue,
    Observer,
    Option,
    Subscription,
    SyncStream,
    Terminator,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {ppqn} from "@opendaw/lib-dsp"
import {
    AudioData,
    ClipNotification,
    ClipSequencingUpdates,
    EngineCommands,
    EngineProcessorOptions,
    EngineState,
    EngineStateSchema,
    EngineToClient,
    ExportStemsConfiguration
} from "@opendaw/studio-adapters"
import {SyncSource} from "@opendaw/lib-box"
import {AnimationFrame} from "@opendaw/lib-dom"
import {Communicator, Messenger} from "@opendaw/lib-runtime"
import {BoxIO} from "@opendaw/studio-boxes"
import {Project} from "./Project"

export class EngineWorklet extends AudioWorkletNode implements EngineCommands {
    static ID: int = 0 | 0

    readonly id = EngineWorklet.ID++

    readonly #terminator: Terminator = new Terminator()
    readonly #playbackTimestamp: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #position: DefaultObservableValue<ppqn> = new DefaultObservableValue(0.0)
    readonly #isPlaying: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isRecording: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #isCountingIn: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #countInBeatsRemaining: DefaultObservableValue<int> = new DefaultObservableValue(0)
    readonly #metronomeEnabled: DefaultObservableValue<boolean> = new DefaultObservableValue(false)
    readonly #markerState: DefaultObservableValue<Nullable<[UUID.Format, int]>> = new DefaultObservableValue<Nullable<[UUID.Format, int]>>(null)
    readonly #notifyClipNotification: Notifier<ClipNotification>
    readonly #playingClips: Array<UUID.Format>
    readonly #commands: EngineCommands
    readonly #isReady: Promise<void>

    constructor(context: BaseAudioContext,
                project: Readonly<Project>,
                exportConfiguration?: ExportStemsConfiguration) {
        const numberOfChannels = ExportStemsConfiguration.countStems(Option.wrap(exportConfiguration)) * 2
        const reader = SyncStream.reader<EngineState>(EngineStateSchema(), state => {
            this.#position.setValue(state.position)
            this.#isPlaying.setValue(state.isPlaying)
            this.#isRecording.setValue(state.isRecording)
            this.#isCountingIn.setValue(state.isCountingIn)
            this.#countInBeatsRemaining.setValue(state.countInBeatsRemaining)
        })

        super(context, "engine-processor", {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [numberOfChannels],
                processorOptions: {
                    sab: reader.buffer,
                    project: project.toArrayBuffer(),
                    exportConfiguration
                } satisfies EngineProcessorOptions
            }
        )

        const {resolve, promise} = Promise.withResolvers<void>()
        const messenger = Messenger.for(this.port)
        this.#isReady = promise
        this.#notifyClipNotification = this.#terminator.own(new Notifier<ClipNotification>())
        this.#playingClips = []
        this.#commands = this.#terminator.own(
            Communicator.sender<EngineCommands>(messenger.channel("engine-commands"),
                dispatcher => new class implements EngineCommands {
                    play(): void {dispatcher.dispatchAndForget(this.play)}
                    stop(reset: boolean): void {dispatcher.dispatchAndForget(this.stop, reset)}
                    setPosition(position: number): void {dispatcher.dispatchAndForget(this.setPosition, position)}
                    startRecording() {dispatcher.dispatchAndForget(this.startRecording)}
                    stopRecording() {dispatcher.dispatchAndForget(this.stopRecording)}
                    setMetronomeEnabled(enabled: boolean): void {dispatcher.dispatchAndForget(this.setMetronomeEnabled, enabled)}
                    queryLoadingComplete(): Promise<boolean> {
                        return dispatcher.dispatchAndReturn(this.queryLoadingComplete)
                    }
                    panic(): void {dispatcher.dispatchAndForget(this.panic)}
                    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void {
                        dispatcher.dispatchAndForget(this.noteOn, uuid, pitch, velocity)
                    }
                    noteOff(uuid: UUID.Format, pitch: byte): void {
                        dispatcher.dispatchAndForget(this.noteOff, uuid, pitch)
                    }
                    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void {
                        dispatcher.dispatchAndForget(this.scheduleClipPlay, clipIds)
                    }
                    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void {
                        dispatcher.dispatchAndForget(this.scheduleClipStop, trackIds)
                    }
                    terminate(): void {dispatcher.dispatchAndForget(this.terminate)}
                }))
        Communicator.executor<EngineToClient>(messenger.channel("engine-to-client"), {
                log: (message: string): void => console.log("WORKLET", message),
                ready: (): void => resolve(),
                fetchAudio: (uuid: UUID.Format): Promise<AudioData> => {
                    return new Promise((resolve, reject) => {
                        const handler = project.sampleManager.getOrCreate(uuid)
                        handler.subscribe(state => {
                            if (state.type === "error") {
                                reject(state.reason)
                            } else if (state.type === "loaded") {
                                resolve(handler.data.unwrap())
                            }
                        })
                    })
                },
                notifyClipSequenceChanges: (changes: ClipSequencingUpdates): void => {
                    changes.stopped.forEach(uuid => {
                        for (let i = 0; i < this.#playingClips.length; i++) {
                            if (UUID.equals(this.#playingClips[i], uuid)) {
                                this.#playingClips.splice(i, 1)
                                break
                            }
                        }
                    })
                    changes.started.forEach(uuid => this.#playingClips.push(uuid))
                    this.#notifyClipNotification.notify({type: "sequencing", changes})
                },
                switchMarkerState: (state: Nullable<[UUID.Format, int]>): void => this.#markerState.setValue(state)
            } satisfies EngineToClient
        )
        this.#terminator.ownAll(
            AnimationFrame.add(() => reader.tryRead()),
            project.liveStreamReceiver.connect(messenger.channel("engine-live-data")),
            new SyncSource<BoxIO.TypeMap>(project.boxGraph, messenger.channel("engine-sync"), false),
            this.#metronomeEnabled.catchupAndSubscribe(owner => this.#commands.setMetronomeEnabled(owner.getValue()))
        )
    }

    play(): void {this.#commands.play()}
    stop(reset: boolean = false): void {this.#commands.stop(reset)}
    setPosition(position: ppqn): void {
        this.#playbackTimestamp.setValue(position)
        this.#commands.setPosition(position)
    }
    startRecording(): void {this.#commands.startRecording()}
    stopRecording(): void {this.#commands.stopRecording()}
    panic(): void {this.#commands.panic()}
    setMetronomeEnabled(enabled: boolean): void {
        this.#commands.setMetronomeEnabled(enabled)
        this.#metronomeEnabled.setValue(enabled)
    }
    isPlaying(): ObservableValue<boolean> {return this.#isPlaying}
    isRecording(): ObservableValue<boolean> {return this.#isRecording}
    isCountingIn(): ObservableValue<boolean> {return this.#isCountingIn}
    countInBeatsRemaining(): ObservableValue<int> {return this.#countInBeatsRemaining}
    position(): ObservableValue<ppqn> {return this.#position}
    playbackTimestamp(): MutableObservableValue<number> {return this.#playbackTimestamp}
    metronomeEnabled(): MutableObservableValue<boolean> {return this.#metronomeEnabled}
    isReady(): Promise<void> {return this.#isReady}
    queryLoadingComplete(): Promise<boolean> {return this.#commands.queryLoadingComplete()}
    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void {this.#commands.noteOn(uuid, pitch, velocity)}
    noteOff(uuid: UUID.Format, pitch: byte): void {this.#commands.noteOff(uuid, pitch)}
    scheduleClipPlay(clipIds: ReadonlyArray<UUID.Format>): void {
        this.#notifyClipNotification.notify({type: "waiting", clips: clipIds})
        this.#commands.scheduleClipPlay(clipIds)
        this.#isPlaying.setValue(true) // must be second, since they might be executed in different blocks
    }
    scheduleClipStop(trackIds: ReadonlyArray<UUID.Format>): void {
        this.#commands.scheduleClipStop(trackIds)
    }
    subscribeClipNotification(observer: Observer<ClipNotification>): Subscription {
        observer({
            type: "sequencing",
            changes: {started: this.#playingClips, stopped: Arrays.empty(), obsolete: Arrays.empty()}
        })
        return this.#notifyClipNotification.subscribe(observer)
    }

    markerState(): DefaultObservableValue<Nullable<[UUID.Format, int]>> {
        return this.#markerState
    }

    terminate(): void {
        this.#terminator.terminate()
        this.disconnect()
    }
}