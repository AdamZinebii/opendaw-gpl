import {Engine} from "./Engine"
import {Terminable, Terminator} from "@opendaw/lib-std"

export class Recording implements Terminable {
    readonly #terminator = new Terminator()
    readonly #engine: Engine

    constructor(engine: Engine) {
        this.#engine = engine
    }

    terminate(): void {
    }
}