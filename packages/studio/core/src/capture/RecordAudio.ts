import {
    asInstanceOf,
    EmptyExec,
    isUndefined,
    Nullish,
    Observer,
    Option,
    quantizeCeil,
    quantizeFloor,
    Subscription,
    Terminable,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioFileBox, AudioRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {SampleLoaderState, SampleManager, TrackType} from "@opendaw/studio-adapters"
import {Engine} from "../Engine"
import {Project} from "../Project"
import {Capture} from "./Capture"

export namespace RecordAudio {
    type RecordAudioContext = {
        sampleManager: SampleManager
        audioContext: AudioContext
        engine: Engine
        project: Project
        capture: Capture
    }

    export const start = ({sampleManager, audioContext, engine, project, capture}: RecordAudioContext): Terminable => {
        console.debug("RecordAudio.start", audioContext)
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
        const uuid = UUID.generate()
        sampleManager.record({
            uuid,
            data: Option.None,
            peaks: Option.None,
            state: {type: "loaded"},
            invalidate: EmptyExec,
            subscribe(observer: Observer<SampleLoaderState>): Subscription {return Terminable.Empty}
        })
        const recordingSubscription = terminator.spawn()
        recordingSubscription.own(engine.isRecording.catchupAndSubscribe(owner => {
            if (owner.getValue()) {
                console.debug(PPQN.toString(engine.position.getValue()))
                recordingSubscription.terminate()
            }
        }))
        let writing: Option<{ fileBox: AudioFileBox, regionBox: AudioRegionBox }> = Option.None



        terminator.own(engine.position.catchupAndSubscribe(owner => {
            const writePosition = owner.getValue()
            if (writing.isEmpty() && engine.isRecording.getValue()) {
                writing = editing.modify(() => {
                    const fileBox = AudioFileBox.create(boxGraph, uuid, box => {
                        box.fileName.setValue("Recording")
                    })
                    const regionBox = AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.file.refer(fileBox)
                        box.regions.refer(trackBox.regions)
                        box.position.setValue(quantizeFloor(engine.position.getValue(), beats))
                    })
                    return {fileBox, regionBox}
                })
            }
            if (writing.isEmpty()) {return}
            const {regionBox} = writing.unwrap()
            editing.modify(() => {
                if (regionBox.isAttached()) {
                    const {position, duration, loopDuration} = regionBox
                    const newDuration = quantizeCeil(writePosition, beats) - position.getValue()
                    duration.setValue(newDuration)
                    loopDuration.setValue(newDuration)
                }
            }, false)
        }))
        return terminator
    }
}