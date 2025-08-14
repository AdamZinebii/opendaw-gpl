import {Engine} from "../Engine"
import {Project} from "../Project"
import {Capture} from "./Capture"
import {
    asInstanceOf,
    byte,
    isUndefined,
    Nullish,
    Option,
    quantizeCeil,
    quantizeFloor,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {TrackType} from "@opendaw/studio-adapters"
import {Events} from "@opendaw/lib-dom"
import {MidiData} from "@opendaw/app-studio/src/midi/MidiData"
import {PPQN} from "@opendaw/lib-dsp"

export namespace RecordMidi {
    type RecordMidiContext = {
        midi: MIDIAccess,
        engine: Engine,
        project: Project,
        capture: Capture
    }
    export const start = ({midi, engine, project, capture}: RecordMidiContext): void => {
        console.debug("RecordMidi.start", midi)
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const trackBox: Nullish<TrackBox> = capture.box.tracks.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, TrackBox))
            .find(box => {
                const hasNoRegions = box.regions.pointerHub.isEmpty()
                const acceptsNotes = box.type.getValue() === TrackType.Notes
                return hasNoRegions && acceptsNotes
            })
        if (isUndefined(trackBox)) {return}
        const {editing, boxGraph} = project
        const terminator = new Terminator()
        const activeNotes = new Map<byte, NoteEventBox>()
        let writing: Option<{ region: NoteRegionBox, collection: NoteEventCollectionBox }> = Option.None
        terminator.own(engine.position.catchupAndSubscribe(owner => {
            if (writing.isEmpty()) {return}
            const position = owner.getValue()
            const {region} = writing.unwrap()
            editing.modify(() => {
                const duration = quantizeCeil(position, beats) - region.position.getValue()
                console.debug("duration", duration)
                region.duration.setValue(duration)
                region.loopDuration.setValue(duration)
                for (const [_, event] of activeNotes) {
                    event.duration.setValue(position - event.position.getValue())
                }
            }, false)
        }))
        terminator.ownAll(...midi.inputs.values()
            .map(input => Events.subscribeAny(input, "midimessage", (event: MIDIMessageEvent) => {
                const data = event.data
                if (isUndefined(data)) {return}
                const position = engine.position.getValue()
                if (MidiData.isNoteOn(data)) {
                    const pitch = MidiData.readParam1(data)
                    if (writing.isEmpty()) {
                        editing.modify(() => {
                            const collection = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                            const region = NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                                box.position.setValue(quantizeFloor(position, beats))
                                box.events.refer(collection.owners)
                                box.regions.refer(trackBox.regions)
                            })
                            writing = Option.wrap({region, collection})
                        }, false)
                    }
                    const {collection} = writing.unwrap()
                    editing.modify(() => {
                        activeNotes.set(pitch, NoteEventBox.create(boxGraph, UUID.generate(), box => {
                            box.position.setValue(position)
                            box.duration.setValue(1.0)
                            box.pitch.setValue(pitch)
                            box.velocity.setValue(MidiData.readParam2(data) / 127.0)
                            box.events.refer(collection.events)
                        }))
                    }, false)
                } else if (MidiData.isNoteOff(data)) {
                    const pitch = MidiData.readParam1(data)
                    activeNotes.delete(pitch)
                }
            })))
        const {isRecording, isCountingIn} = engine
        const stop = (): void => {
            if (isRecording.getValue() || isCountingIn.getValue()) {return}
            terminator.terminate()
        }
        terminator.own(engine.isRecording.subscribe(stop))
        terminator.own(engine.isCountingIn.subscribe(stop))
    }
}