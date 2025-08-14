import {DefaultObservableValue, MutableObservableValue, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"

export class Capture implements Terminable {
    readonly #terminator: Terminator = new Terminator()

    readonly #box: AudioUnitBox

    readonly #armed: MutableObservableValue<boolean>

    constructor(box: AudioUnitBox) {
        this.#box = box

        this.#armed = this.#terminator.own(new DefaultObservableValue(false))
    }

    get box(): AudioUnitBox {return this.#box}
    get uuid(): UUID.Format {return this.#box.address.uuid}
    get armed(): MutableObservableValue<boolean> {return this.#armed}

    own<T extends Terminable>(terminable: T): T {return this.#terminator.own(terminable)}
    ownAll<T extends Terminable>(...terminables: ReadonlyArray<T>): void {this.#terminator.ownAll(...terminables)}
    terminate(): void {this.#terminator.terminate()}
}