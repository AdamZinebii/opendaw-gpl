import {asInstanceOf, isUndefined, Nullish, Option, quantizeCeil, Terminable, Terminator} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {TrackType} from "@opendaw/studio-adapters"
import {Engine} from "../Engine"
import {Project} from "../Project"
import {Capture} from "./Capture"

export namespace RecordAudio {
    type RecordAudioContext = {
        context: AudioContext,
        engine: Engine,
        project: Project,
        capture: Capture
    }

    export const start = ({context, engine, project, capture}: RecordAudioContext): Terminable => {
        console.debug("RecordAudio.start", context)
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const trackBox: Nullish<TrackBox> = capture.box.tracks.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, TrackBox))
            .find(box => {
                const hasNoRegions = box.regions.pointerHub.isEmpty()
                const acceptsNotes = box.type.getValue() === TrackType.Audio
                return hasNoRegions && acceptsNotes
            })
        if (isUndefined(trackBox)) {return Terminable.Empty} // TODO Create a new track
        const {editing, boxGraph} = project
        const terminator = new Terminator()
        let writing: Option<{ region: AudioRegionBox }> = Option.None
        terminator.own(engine.position.catchupAndSubscribe(owner => {
            if (writing.isEmpty()) {return}
            const writePosition = owner.getValue()
            const {region} = writing.unwrap()
            editing.modify(() => {
                if (region.isAttached()) {
                    const {position, duration, loopDuration} = region
                    const newDuration = quantizeCeil(writePosition, beats) - position.getValue()
                    duration.setValue(newDuration)
                    loopDuration.setValue(newDuration)
                } else {
                    writing = Option.None
                }
            }, false)
        }))
        return terminator
    }
}