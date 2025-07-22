import {Project} from "./Project"
import {IndexedBox} from "@opendaw/lib-box"
import {AudioUnitBox, TimelineBox, TrackBox} from "@opendaw/studio-boxes"
import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    BooleanParameterSchema,
    ChannelSchema,
    ProjectSchema,
    RealParameterSchema,
    TimeSignatureParameterSchema,
    TrackSchema,
    TransportSchema,
    Unit
} from "@opendaw/lib-dawproject"

export namespace DawProjectIO {
    export const encode = ({rootBox, timelineBox}: Project): string => {
        const trackBoxes = IndexedBox.collectIndexedBoxes(rootBox.audioUnits, AudioUnitBox)
            .flatMap(audioUnitBox => IndexedBox.collectIndexedBoxes(audioUnitBox.tracks, TrackBox))

        const rootNode = Xml.element({
            version: "1.0",
            application: Xml.element({
                name: "openDAW",
                version: "0.1"
            }, ApplicationSchema),
            transport: createTransport(timelineBox),
            structure: [
                Xml.element({
                    id: "0",
                    contentType: "notes",
                    channel: Xml.element({
                        audioChannels: 2,
                        mute: Xml.element({value: true}, BooleanParameterSchema)
                    }, ChannelSchema),
                    tracks: [
                        Xml.element({
                            id: "01",
                            contentType: "audio"
                        }, TrackSchema),
                        Xml.element({
                            id: "02",
                            contentType: "audio"
                        }, TrackSchema)
                    ]
                }, TrackSchema),
                Xml.element({
                    id: "1",
                    contentType: "audio"
                }, TrackSchema)
            ]
        }, ProjectSchema)
        return Xml.pretty(Xml.toElement("Project", rootNode))
    }

    const createTransport = (timelineBox: TimelineBox) => Xml.element({
        tempo: Xml.element({
            unit: Unit.BPM,
            value: timelineBox.bpm.getValue()
        }, RealParameterSchema),
        timeSignature: Xml.element({
            nominator: timelineBox.signature.nominator.getValue(),
            denominator: timelineBox.signature.denominator.getValue()
        }, TimeSignatureParameterSchema)
    }, TransportSchema)
}