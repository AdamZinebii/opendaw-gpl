import {Option, quantizeFloor, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {AudioFileBox, AudioRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {SampleManager, TrackType} from "@opendaw/studio-adapters"
import {Engine} from "../Engine"
import {Project} from "../Project"
import {Capture} from "./Capture"
import {RecordTrack} from "./RecordTrack"
import {RecordingWorklet} from "../RecordingWorklet"
import {RenderQuantum} from "../RenderQuantum"

export namespace RecordAudio {
    type RecordAudioContext = {
        recordingWorklet: RecordingWorklet
        mediaStream: MediaStream
        sampleManager: SampleManager
        audioContext: AudioContext
        engine: Engine
        project: Project
        capture: Capture
    }

    export const start = (
        {recordingWorklet, mediaStream, sampleManager, audioContext, engine, project, capture}: RecordAudioContext
    ): Terminable => {
        console.debug("RecordAudio.start", audioContext)
        const terminator = new Terminator()
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const {editing, boxGraph} = project
        const trackBox: TrackBox = RecordTrack.findOrCreate(editing, capture.box, TrackType.Audio)
        const uuid = recordingWorklet.uuid
        sampleManager.record(recordingWorklet)
        console.debug(Math.floor(audioContext.outputLatency * audioContext.sampleRate / RenderQuantum))
        const streamSource = audioContext.createMediaStreamSource(mediaStream)
        let writing: Option<{ fileBox: AudioFileBox, regionBox: AudioRegionBox }> = Option.None
        terminator.ownAll(
            recordingWorklet,
            engine.position.catchupAndSubscribe(owner => {
                if (writing.isEmpty() && engine.isRecording.getValue()) {
                    streamSource.connect(recordingWorklet)
                    writing = editing.modify(() => {
                        const position = quantizeFloor(owner.getValue(), beats)
                        console.debug("position", PPQN.toString(position))
                        const fileBox = AudioFileBox.create(boxGraph, uuid, box => {
                            box.fileName.setValue("Recording")
                        })
                        const regionBox = AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                            box.file.refer(fileBox)
                            box.regions.refer(trackBox.regions)
                            box.position.setValue(position)
                        })
                        return {fileBox, regionBox}
                    })
                }
                if (writing.isEmpty()) {return}
                const {regionBox} = writing.unwrap()
                editing.modify(() => {
                    if (regionBox.isAttached()) {
                        const {duration, loopDuration} = regionBox
                        const newDuration = Math.floor(PPQN.samplesToPulses(
                            recordingWorklet.numberOfFrames, project.timelineBox.bpm.getValue(), audioContext.sampleRate))
                        duration.setValue(newDuration)
                        loopDuration.setValue(newDuration)
                    }
                }, false)
            }))
        return terminator
    }
}