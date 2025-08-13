import {Project} from "./Project"
import {Engine} from "./Engine"
import {byte, Terminable, unitValue, UUID} from "@opendaw/lib-std"

export class EngineRecording implements Terminable {
    readonly #project: Project
    readonly #engine: Engine

    constructor(project: Project, engine: Engine) {
        this.#project = project
        this.#engine = engine
    }

    noteOn(uuid: UUID.Format, pitch: byte, velocity: unitValue): void {
        console.debug("Recording note on: ", UUID.toString(uuid), pitch, velocity)
    }

    noteOff(uuid: UUID.Format, pitch: byte): void {
        console.debug("Recording note off: ", UUID.toString(uuid), pitch)
    }

    terminate(): void {
    }
}