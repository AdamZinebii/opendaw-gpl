import {Processor} from "./processing"
import {NoteEventSource, NoteEventTarget} from "./NoteEventSource"
import {int, Terminable, UUID} from "@opendaw/lib-std"
import {MidiEffectDeviceAdapter} from "@opendaw/studio-adapters"

export interface MidiEffectProcessor extends Processor, NoteEventSource, NoteEventTarget, Terminable {
    get uuid(): UUID.Format

    index(): int
    adapter(): MidiEffectDeviceAdapter
}