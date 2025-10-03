import css from "./DevicesBrowser.sass?inline"
import {isInstanceOf, Lifecycle, Objects, panic} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {DragAndDrop} from "@/ui/DragAndDrop"
import {DragDevice} from "@/ui/AnyDragData"
import {TextTooltip} from "@/ui/surface/TextTooltip"
import {DeviceHost, Devices} from "@opendaw/studio-adapters"
import {EffectFactories, EffectFactory, InstrumentFactories, Project} from "@opendaw/studio-core"
import {ModularBox} from "@opendaw/studio-boxes"
import {Icon} from "../components/Icon"

const className = Html.adoptStyleSheet(css, "DevicesBrowser")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    filter?: "instruments-only" | "effects-only" | "all"
    onDeviceSelected?: () => void
}

export const DevicesBrowser = ({lifecycle, service, filter = "all", onDeviceSelected}: Construct) => {
    const {project} = service
    const showInstruments = filter === "all" || filter === "instruments-only"
    const showEffects = filter === "all" || filter === "effects-only"
    
    return (
        <div className={className}>
            <div className="resources">
            {showInstruments && (
                <section className="instrument">
                    <h1>Instruments</h1>
                    {createInstrumentList(lifecycle, project, onDeviceSelected)}
                </section>
            )}
                {showEffects && (
                    <section className="audio">
                        <h1>Audio Effects</h1>
                        {createEffectList(lifecycle, service, project, Objects.exclude(EffectFactories.AudioNamed, "Modular"), "audio-effect", onDeviceSelected)}
                    </section>
                )}
                {/* MIDI Effects section - DISABLED FOR NOW, WILL BE RE-ENABLED IN THE FUTURE */}
                {/* {showEffects && (
                    <section className="midi">
                        <h1>Midi Effects</h1>
                        {createEffectList(lifecycle, service, project, EffectFactories.MidiNamed, "midi-effect", onDeviceSelected)}
                    </section>
                )} */}
            </div>
            <div className="manual help-section">
                {showInstruments && (
                    <section>
                        <h1>Creating an Instrument</h1>
                        <p>
                            To start making sound, click on an instrument from the list. This will create a new instance in
                            your
                            project.
                        </p>
                    </section>
                )}
                {showEffects && (
                    <section>
                        <h1>Adding Effects</h1>
                        <p>
                            Once an instrument is created, you can add effects. To do this, simply drag an effect
                            from the list and drop it into the instrument's device chain.
                        </p>
                    </section>
                )}
            </div>
        </div>
    )
}

const deviceColors: Record<string, string> = {
    // Instruments
    "Tape": "hsl(0, 0%, 85%)",
    "Nano": "hsl(0, 0%, 90%)",
    "Playfield": "hsl(0, 0%, 95%)",
    "Vaporisateur": "hsl(0, 0%, 75%)",
    // Audio Effects
    "StereoTool": "hsl(0, 0%, 82%)",
    "Delay": "hsl(0, 0%, 92%)",
    "Reverb": "hsl(0, 0%, 87%)",
    "Revamp": "hsl(0, 0%, 88%)",
    // MIDI Effects
    "Arpeggio": "hsl(0, 0%, 90%)",
    "Pitch": "hsl(0, 0%, 85%)",
    "Zeitgeist": "hsl(0, 0%, 88%)"
}

const createInstrumentList = (lifecycle: Lifecycle, project: Project, onDeviceSelected?: () => void) => (
    <ul>{
        Object.entries(InstrumentFactories.Named).map(([key, factory]) => {
            const element = (
                <li onclick={() => {
                    project.editing.modify(() => project.api.createInstrument(factory))
                    onDeviceSelected?.()
                }} style={{"--device-color": deviceColors[key] || "hsl(290, 70%, 65%)"}}>
                    <div className="icon">
                        <Icon symbol={factory.defaultIcon}/>
                    </div>
                    {factory.defaultName}
                </li>
            )
            lifecycle.ownAll(
                DragAndDrop.installSource(element, () => ({
                    type: "instrument",
                    device: key as InstrumentFactories.Keys,
                    copy: true
                } satisfies DragDevice)),
                TextTooltip.simple(element, () => {
                    const {bottom, left} = element.getBoundingClientRect()
                    return {clientX: left, clientY: bottom + 12, text: factory.description}
                })
            )
            return element
        })
    }</ul>
)

const createEffectList = <
    R extends Record<string, EffectFactory>,
    T extends DragDevice["type"]>(lifecycle: Lifecycle, service: StudioService, project: Project, records: R, type: T, onDeviceSelected?: () => void): HTMLUListElement => (
    <ul>{
        Object.entries(records).map(([key, entry]) => {
            const element = (
                <li onclick={() => {
                    const {boxAdapters, editing, userEditingManager} = project
                    userEditingManager.audioUnit.get().ifSome(vertex => {
                        const deviceHost: DeviceHost = boxAdapters.adapterFor(vertex.box, Devices.isHost)
                        if (type === "midi-effect" && deviceHost.inputAdapter.mapOr(input => input.accepts !== "midi", true)) {
                            return
                        }
                        const effectField =
                            type === "audio-effect" ? deviceHost.audioEffects.field()
                                : type === "midi-effect" ? deviceHost.midiEffects.field()
                                    : panic(`Unknown ${type}`)
                        editing.modify(() => {
                            const box = entry.create(project, effectField, effectField.pointerHub.incoming().length)
                            if (isInstanceOf(box, ModularBox)) {
                                service.switchScreen("modular")
                            }
                            return box
                        })
                        onDeviceSelected?.()
                    })
                }} style={{"--device-color": deviceColors[key] || "hsl(280, 65%, 58%)"}}>
                    <div className="icon">
                        <Icon symbol={entry.defaultIcon}/>
                    </div>
                    {entry.defaultName}
                </li>
            )
            lifecycle.ownAll(
                DragAndDrop.installSource(element, () => ({
                    type: type as any,
                    start_index: null,
                    device: key as keyof typeof EffectFactories.MergedNamed
                } satisfies DragDevice)),
                TextTooltip.simple(element, () => {
                    const {bottom, left} = element.getBoundingClientRect()
                    return {clientX: left, clientY: bottom + 12, text: entry.description}
                })
            )
            return element
        })
    }</ul>
)