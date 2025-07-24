import {
    AudioSchema,
    ClipSchema,
    ClipsSchema,
    LaneSchema,
    LanesSchema,
    NoteSchema,
    NotesSchema,
    ProjectSchema,
    TimelineSchema,
    TrackSchema,
    WarpsSchema
} from "@opendaw/lib-dawproject"
import {asDefined, isInstanceOf, isUndefined, Nullish} from "@opendaw/lib-std"
import {DawProjectIO} from "./DawProjectIO"

/**
 * Collecting notes:
 *
 * The intense nesting is very cumbersome to work with.
 * Almost everything in dawproject is a timeline, even audio.
 */
export class DawProjectImporter {
    readonly #project: ProjectSchema
    readonly #samples: DawProjectIO.Samples

    constructor(project: ProjectSchema, samples: DawProjectIO.Samples) {
        this.#project = project
        this.#samples = samples

        this.readTransport()
        this.readStructure()
        this.readArrangement()
    }

    readTransport(): void {
        const {transport} = this.#project
        if (isUndefined(transport)) {return}
        console.debug("tempo", transport.tempo?.value, transport.tempo?.unit)
        console.debug("signature", transport.timeSignature?.numerator, transport.timeSignature?.denominator)
    }

    readStructure(): void {
        const {structure} = this.#project
        structure.forEach((lane: LaneSchema) => {
            if (isInstanceOf(lane, TrackSchema)) {
                // This will be our AudioUnitBox
                // console.debug("id", lane.id)
                // console.debug("contentType", lane.contentType)
                // console.debug("channel", lane.channel)
            }
        })
    }

    readArrangement(): void {
        const {arrangement} = this.#project

        const readRegions = (clips: ClipsSchema): void => clips.clips.forEach(readAnyRegion)

        const readLane = (lane: LanesSchema): void => {
            const id = lane.id // to be referenced
            const track = lane.track // links to track in structure
            console.debug("id", id)
            console.debug("track", track)
            lane?.lanes?.filter(timeline => isInstanceOf(timeline, ClipsSchema)).forEach(readRegions)
        }

        const readAnyRegion = (clip: ClipSchema): void => {
            // this is the start of a region
            console.debug("region", clip.name, clip.time, clip.duration)
            clip.content?.forEach((content: TimelineSchema) => {
                if (isInstanceOf(content, ClipsSchema)) {
                    readAnyRegionContent(clip, content)
                } else if (isInstanceOf(content, NotesSchema)) {
                    readNoteRegionContent(clip, content)
                }
            })
        }

        const readNoteRegionContent = (clip: ClipSchema, notes: NotesSchema): void => {
            console.dir(notes.notes?.map((note: NoteSchema) => ({
                key: note.key,
                p: note.time
            })), {depth: Number.MAX_SAFE_INTEGER})
        }

        const readAnyRegionContent = (clip: ClipSchema, content: ClipsSchema): void => {
            const contentClip = content.clips.at(0)
            if (isUndefined(contentClip)) {
                console.warn(clip, "audio-clip without content-clip?")
                return
            }
            const innerContent = contentClip.content?.at(0) as Nullish<TimelineSchema>
            // From which point is it guaranteed that this is an audio region?
            if (isInstanceOf(innerContent, WarpsSchema)) {
                const audio = innerContent?.content?.at(0) as Nullish<AudioSchema>
                const path = asDefined(audio?.file.path)
                const sample = this.#samples.load(path)
                console.debug(path, sample.byteLength)
            }
        }

        arrangement?.lanes?.lanes?.filter(timeline => isInstanceOf(timeline, LanesSchema)).forEach(readLane)
    }
}