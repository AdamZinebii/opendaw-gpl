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
import {ProjectEnv} from "./ProjectEnv"
import {asDefined} from "@opendaw/lib-std"
import JSZip from "jszip"

export namespace DawProjectIO {
    export const decode = async (env: ProjectEnv, arrayBuffer: ArrayBuffer): Promise<Project> => {
        const zip = await JSZip.loadAsync(arrayBuffer)
        const {transport, arrangement} = Xml.parse(asDefined(await zip.file("project.xml")
            ?.async("string"), "No project.xml found"), ProjectSchema)
        const project = Project.new(env)
        const {timelineBox, boxGraph} = project
        boxGraph.beginTransaction()
        {
            timelineBox.bpm.setValue(transport?.tempo?.value ?? 120.0)
            timelineBox.signature.nominator.setValue(transport?.timeSignature?.numerator ?? 4)
            timelineBox.signature.denominator.setValue(transport?.timeSignature?.denominator ?? 4)
            // TODO :-)
        }
        boxGraph.endTransaction()
        return project
    }

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
            numerator: timelineBox.signature.nominator.getValue(),
            denominator: timelineBox.signature.denominator.getValue()
        }, TimeSignatureParameterSchema)
    }, TransportSchema)
}