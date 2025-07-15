import {ProgressHandler, UUID} from "@opendaw/lib-std"
import {Sample} from "@opendaw/studio-adapters"

export type SampleImporter = {
    importSample(sample: {
        uuid: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler?: ProgressHandler
    }): Promise<Sample>
}