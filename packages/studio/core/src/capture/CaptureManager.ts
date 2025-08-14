import {asInstanceOf, MutableObservableValue, SortedSet, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {Capture} from "./Capture"
import {Project} from "../Project"
import {Engine} from "../Engine"

export class CaptureManager implements Terminable {
    readonly #subscription: Subscription
    readonly #captures: SortedSet<UUID.Format, Capture>

    constructor(project: Project) {
        this.#captures = UUID.newSet<Capture>(unit => unit.uuid)

        this.#subscription = project.rootBox.audioUnits.pointerHub.catchupAndSubscribeTransactual({
            onAdd: ({box}) => this.#captures.add(new Capture(asInstanceOf(box, AudioUnitBox))),
            onRemove: ({box: {address: {uuid}}}) => this.#captures.removeByKey(uuid)
        })
    }

    startRecording(engine: Engine): void {
        engine.startRecording()
        const captures = this.filterArmed()
        const lifeCycle = engine.isRecording.subscribe(recording => {
            if (!recording.getValue()) {
                console.debug("recording stopped")
                lifeCycle.terminate()
            }
        })
        console.debug("start recording",
            captures.map(x => x.box.input.pointerHub.incoming().at(0)?.box.toString()))
    }

    filterArmed(): ReadonlyArray<Capture> {
        return this.#captures.values().filter(capture => capture.armed.getValue())
    }

    getObservableArmedState(uuid: UUID.Format): MutableObservableValue<boolean> {
        return this.#captures.get(uuid).armed
    }
    terminate(): void {
        this.#subscription.terminate()
        this.#captures.clear()
    }
}