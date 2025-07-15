import {ProgressHandler, UUID} from "@opendaw/lib-std"
import {AudioData, SampleMetaData} from "@opendaw/studio-adapters"

export interface SampleProvider {
    fetch(uuid: UUID.Format, progress: ProgressHandler): Promise<[AudioData, SampleMetaData]>
}