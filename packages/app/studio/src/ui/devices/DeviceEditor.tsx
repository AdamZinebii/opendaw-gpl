import css from "./DeviceEditor.sass?inline"
import {Lifecycle, ObservableValue, Procedure, Provider} from "@opendaw/lib-std"
import {createElement, Group, JsxValue} from "@opendaw/lib-jsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {MenuItem} from "@/ui/model/menu-item"
import {DeviceBoxAdapter, DeviceType, EffectDeviceBoxAdapter, IconSymbol} from "@opendaw/studio-adapters"
import {DebugMenus} from "@/ui/menu/debug.ts"
import {DragDevice} from "@/ui/AnyDragData"
import {DragAndDrop} from "@/ui/DragAndDrop"
import {Events, Html} from "@opendaw/lib-dom"
import {TextScroller} from "@/ui/TextScroller"
import {StringField} from "@opendaw/lib-box"
import {Colors, Project} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "DeviceEditor")

const getColorFor = (type: DeviceType, deviceName?: string) => {
    // First try to get device-specific color
    if (deviceName) {
        const lowerName = deviceName.toLowerCase()
        if (lowerName.includes('nano')) return "var(--device-nano-green)"
        if (lowerName.includes('tape')) return "var(--device-tape-green)"
        if (lowerName.includes('playfield') || lowerName.includes('drumset')) return "var(--device-playfield-green)"
        if (lowerName.includes('vaporisateur') || lowerName.includes('synthesizer')) return "var(--device-vaporisateur-green)"
        if (lowerName.includes('revamp') || lowerName.includes('eq')) return "var(--device-revamp-green)"
        if (lowerName.includes('stereo')) return "var(--device-stereo-green)"
        if (lowerName.includes('reverb')) return "var(--device-reverb-green)"
        if (lowerName.includes('delay')) return "var(--device-delay-green)"
        if (lowerName.includes('modular')) return "var(--device-modular-green)"
    }
    
    // Fallback to type-based colors
    switch (type) {
        case "midi-effect":
            return "hsl(120, 50%, 35%)" // Darker green for MIDI effects
        case "bus":
            return "hsl(120, 60%, 40%)" // Medium green for bus
        case "instrument":
            return "hsl(120, 65%, 45%)" // Brighter green for instruments
        case "audio-effect":
            return "hsl(120, 55%, 30%)" // Even darker green for audio effects
    }
}

type Construct = {
    lifecycle: Lifecycle
    project: Project
    adapter: DeviceBoxAdapter
    populateMenu: Procedure<MenuItem>
    populateControls: Provider<JsxValue>
    populateMeter: Provider<JsxValue>
    createLabel?: Provider<HTMLElement>
    icon: IconSymbol
}

const defaultLabelFactory = (lifecycle: Lifecycle, labelField: StringField): Provider<JsxValue> =>
    () => {
        const label: HTMLElement = <h1/>
        lifecycle.ownAll(
            TextScroller.install(label),
            labelField.catchupAndSubscribe(owner => label.textContent = owner.getValue())
        )
        return label
    }

export const DeviceEditor =
    ({lifecycle, project, adapter, populateMenu, populateControls, populateMeter, createLabel, icon}: Construct) => {
        const {editing} = project
        const {box, type, enabledField, minimizedField, labelField} = adapter
        const color = getColorFor(type, labelField.getValue() || adapter.constructor.name)
        const header: HTMLElement = (
            <header style={{color}}>
                <div className="icon">
                    <Icon symbol={icon}/>
                </div>
                {(createLabel ?? defaultLabelFactory(lifecycle, labelField))()}
            </header>
        )
        const element: HTMLElement = (
            <div className={Html.buildClassList(className, minimizedField.getValue() && "minimized")} data-drag>
                {header}
                <MenuButton root={MenuItem.root()
                    .setRuntimeChildrenProcedure(parent => {
                        populateMenu(parent)
                        parent.addMenuItem(DebugMenus.debugBox(box))
                    })} style={{minWidth: "0", fontSize: "0.75em"}} appearance={{color, activeColor: Colors.bright}}>
                    <Icon symbol={IconSymbol.Menu}/>
                </MenuButton>
                <Group>{minimizedField.getValue() ? false : populateControls()}</Group>
                <Group>{populateMeter()}</Group>
                <div/>
            </div>
        )
        if (type === "midi-effect" || type === "audio-effect") {
            const effect = adapter as EffectDeviceBoxAdapter
            lifecycle.own(DragAndDrop.installSource(header, () => ({
                type: effect.type,
                start_index: effect.indexField.getValue()
            } satisfies DragDevice), element))
        }
        lifecycle.ownAll(
            enabledField.catchupAndSubscribe((owner: ObservableValue<boolean>) =>
                element.classList.toggle("enabled", owner.getValue())),
            Events.subscribe(header, "dblclick", () => editing.modify(() => minimizedField.toggle()))
        )
        return element
    }