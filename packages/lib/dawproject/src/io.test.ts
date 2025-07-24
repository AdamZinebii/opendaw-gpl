import {readFileSync} from "fs"
import {resolve} from "path"
import {describe, it} from "vitest"
import {
    ArrangementSchema,
    AudioSchema,
    ClipSchema,
    ClipsSchema,
    DAWProjectIO,
    LaneSchema,
    LanesSchema,
    NoteSchema,
    NotesSchema,
    TimelineSchema,
    TrackSchema,
    TransportSchema,
    WarpsSchema
} from "./"
import {asDefined, isDefined, isInstanceOf, isUndefined, Nullish} from "@opendaw/lib-std"

/**
 * Collecting notes:
 * Almost everything in dawproject is a timeline, even audio
 */

describe("DAW-project IO", () => {
    it("read full dawproject", async () => {
        const buffer = readFileSync(resolve(__dirname, "../test-files/sample.dawproject"))
        const {metaData, project, samples} = await DAWProjectIO.decode(buffer)
        // console.dir(project.arrangement, {depth: Number.MAX_SAFE_INTEGER})

        const clipsA = project.arrangement?.lanes?.lanes?.at(0) as LanesSchema
        const clipsB = clipsA.lanes?.at(0) as ClipsSchema
        const clipsC = clipsB.clips.at(0)?.content as ReadonlyArray<ClipsSchema>
        const clipD = clipsC.at(0)?.clips.at(0) as ClipSchema
        const warps = clipD?.content?.at(0) as WarpsSchema
        // console.dir(warps.content?.at(0), {depth: Number.MAX_SAFE_INTEGER})
        // console.debug("---")
        // console.debug(project.arrangement)
        // console.debug("---")

        const readTransport = (transport: TransportSchema) => {
            console.debug("tempo", transport.tempo?.value, transport.tempo?.unit)
            console.debug("signature", transport.timeSignature?.numerator, transport.timeSignature?.denominator)
        }

        const readStructure = (structure: ReadonlyArray<LaneSchema>) => {
            structure.forEach((lane: LaneSchema) => {
                if (isInstanceOf(lane, TrackSchema)) {
                    // This will be our AudioUnitBox
                    // console.debug("id", lane.id)
                    // console.debug("contentType", lane.contentType)
                    // console.debug("channel", lane.channel)
                }
            })
        }

        const readArrangement = (arrangement: ArrangementSchema) => {
            arrangement?.lanes?.lanes?.forEach((timeline: Nullish<TimelineSchema>) => {
                // This is the first level of lanes, probably the content of "tracks" in the openDAW world
                if (isInstanceOf(timeline, LanesSchema)) {
                    const id = timeline.id // to be referenced
                    const track = timeline.track // links to track in structure
                    // console.debug("id", id)
                    // console.debug("track", track)
                    timeline.lanes?.forEach((timeline: TimelineSchema) => {
                        if (isInstanceOf(timeline, ClipsSchema)) {
                            // this is the start of a region providing an 'id'
                            timeline.clips.forEach((clip: ClipSchema) => {
                                console.debug("region", clip.name, clip.time, clip.duration)
                                clip.content?.forEach((content: TimelineSchema) => {
                                    if (isInstanceOf(content, NotesSchema)) {
                                        console.dir(content.notes?.map((note: NoteSchema) => ({
                                            key: note.key,
                                            p: note.time
                                        })), {depth: Number.MAX_SAFE_INTEGER})
                                    } else if (isInstanceOf(content, ClipsSchema)) {
                                        // we are going to ignore it, since it seems only to mirror the region-clip
                                        // there are probably cases that will behave differently
                                        const contentClip = content.clips.at(0)
                                        if (isUndefined(contentClip)) {
                                            console.warn(clip, "audio-clip without content-clip?")
                                            return
                                        }
                                        const warps = contentClip.content?.at(0) as Nullish<WarpsSchema>
                                        const audio = warps?.content?.at(0) as Nullish<AudioSchema>
                                        console.debug("------> AUDIO")
                                        console.debug(samples.load(asDefined(audio?.file.path)).byteLength)
                                        console.debug("<------ AUDIO")
                                    }
                                })
                            })
                        }
                    })
                }
            })
        }

        readStructure(project.structure)

        if (isDefined(project.transport)) {
            readTransport(project.transport)
        }
        if (isDefined(project.arrangement)) {
            readArrangement(project.arrangement)
        }
    })
})