import {UUID} from "@opendaw/lib-std"
import {SampleLoader} from "./SampleLoader"

export interface SampleManager {
    getOrCreate(uuid: UUID.Format): SampleLoader
    invalidate(uuid: UUID.Format): void
}