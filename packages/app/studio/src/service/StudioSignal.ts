import {ProjectMeta} from "@/project/ProjectMeta"
import {Sample} from "@opendaw/studio-adapters"

export type StudioSignal =
    | {
    type: "reset-peaks"
} | {
    type: "import-sample", sample: Sample
} | {
    type: "delete-project", meta: ProjectMeta
}