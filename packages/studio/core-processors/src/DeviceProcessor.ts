import {Terminable, UUID} from "@opendaw/lib-std"
import {Processor} from "./processing"

export interface DeviceProcessor extends Terminable {
    get uuid(): UUID.Format
    get incoming(): Processor
    get outgoing(): Processor
}