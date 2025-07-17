import {DeviceHost, Devices, EffectDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {MenuItem} from "@/ui/model/menu-item.ts"
import {Editing, PrimitiveField, PrimitiveValues, StringField} from "@opendaw/lib-box"
import {EmptyExec, isInstanceOf, panic} from "@opendaw/lib-std"
import {Surface} from "@/ui/surface/Surface"
import {FloatingTextInput} from "@/ui/components/FloatingTextInput"
import {StudioService} from "@/service/StudioService"
import {EffectFactories, Project} from "@opendaw/studio-core"
import {ModularDeviceBox} from "@opendaw/studio-boxes"

export namespace MenuItems {
    export const forAudioUnitInput = (parent: MenuItem, service: StudioService, deviceHost: DeviceHost): void => {
        const {project} = service
        const {editing, api} = project
        const audioUnit = deviceHost.audioUnitBoxAdapter()
        const canProcessMidi = deviceHost.inputAdapter.mapOr(input => input.accepts === "midi", false)
        parent.addMenuItem(
            MenuItem.default({
                label: `Delete '${deviceHost.label}'`,
                hidden: audioUnit.isOutput
            }).setTriggerProcedure(() => editing.modify(() => deviceHost.box.delete())
            ),
            MenuItem.default({
                label: "Minimized",
                checked: deviceHost.minimizedField.getValue()
            }).setTriggerProcedure(() => editing.modify(() => deviceHost.minimizedField.toggle())),
            createMenuItemToRenameDevice(editing, audioUnit.inputAdapter.unwrap().labelField),
            MenuItem.default({label: "Add Midi-Effect", separatorBefore: true, selectable: canProcessMidi})
                .setRuntimeChildrenProcedure(parent => parent.addMenuItem(...EffectFactories.MidiList
                    .map(entry => MenuItem.default({
                        label: entry.defaultName,
                        separatorBefore: entry.separatorBefore
                    }).setTriggerProcedure(() => editing.modify(() => api.insertEffect(deviceHost.midiEffects.field(), entry, 0))))
                )),
            MenuItem.default({label: "Add Audio Effect"})
                .setRuntimeChildrenProcedure(parent => parent.addMenuItem(...EffectFactories.AudioList
                    .map(entry => MenuItem.default({
                        label: entry.defaultName,
                        separatorBefore: entry.separatorBefore
                    }).setTriggerProcedure(() => editing.modify(() => api.insertEffect(deviceHost.audioEffects.field(), entry, 0))
                        .ifSome(box => {
                            if (isInstanceOf(box, ModularDeviceBox)) {service.switchScreen("modular")}
                        })))
                ))
        )
    }

    export const createForValue = <V extends PrimitiveValues>(editing: Editing,
                                                              label: string,
                                                              primitive: PrimitiveField<V, any>,
                                                              value: V) =>
        MenuItem.default({label, checked: primitive.getValue() === value})
            .setTriggerProcedure(() => editing.modify(() => primitive.setValue(value)))

    export const forEffectDevice = (parent: MenuItem, service: StudioService, host: DeviceHost, device: EffectDeviceBoxAdapter): void => {
        const {project} = service
        const {editing} = project
        parent.addMenuItem(
            createMenuItemToToggleEnabled(editing, device),
            createMenuItemToToggleMinimized(editing, device),
            createMenuItemToDeleteDevice(editing, device),
            createMenuItemToRenameDevice(editing, device.labelField),
            createMenuItemToCreateEffect(service, host, device),
            createMenuItemToMoveEffect(project, host, device)
        )
    }

    const createMenuItemToRenameDevice = (editing: Editing, labelField: StringField) =>
        MenuItem.default({label: "Rename..."}).setTriggerProcedure(() => {
            const resolvers = Promise.withResolvers<string>()
            const surface = Surface.get()
            surface.flyout.appendChild(FloatingTextInput({
                position: surface.pointer,
                value: labelField.getValue(),
                resolvers
            }))
            resolvers.promise.then(newName => editing.modify(() => labelField.setValue(newName)), EmptyExec)
        })

    const createMenuItemToToggleEnabled = (editing: Editing, {enabledField}: EffectDeviceBoxAdapter) =>
        MenuItem.default({label: "Enabled", checked: enabledField.getValue()})
            .setTriggerProcedure(() => editing.modify(() =>
                enabledField.setValue(!enabledField.getValue())))

    const createMenuItemToToggleMinimized = (editing: Editing, {minimizedField}: EffectDeviceBoxAdapter) =>
        MenuItem.default({label: "Minimized", checked: minimizedField.getValue()})
            .setTriggerProcedure(() => editing.modify(() => {
                minimizedField.setValue(!minimizedField.getValue())
            }))

    const createMenuItemToDeleteDevice = (editing: Editing, ...devices: ReadonlyArray<EffectDeviceBoxAdapter>) => {
        const label = `Delete '${devices.map(device => device.labelField.getValue()).join(", ")}'`
        return MenuItem.default({label})
            .setTriggerProcedure(() => editing.modify(() => Devices.deleteEffectDevices(devices)))
    }

    const createMenuItemToCreateEffect = (service: StudioService, host: DeviceHost, adapter: EffectDeviceBoxAdapter) => {
        const {project} = service
        const {editing, api} = project
        return adapter.accepts === "audio"
            ? MenuItem.default({label: "Add Audio Effect", separatorBefore: true})
                .setRuntimeChildrenProcedure(parent => parent
                    .addMenuItem(...EffectFactories.AudioList
                        .map(factory => MenuItem.default({
                            label: factory.defaultName,
                            separatorBefore: factory.separatorBefore
                        }).setTriggerProcedure(() =>
                            editing.modify(() => api.insertEffect(host.audioEffects.field(), factory, adapter.indexField.getValue() + 1))
                                .ifSome(box => {
                                    if (isInstanceOf(box, ModularDeviceBox)) {service.switchScreen("modular")}
                                })))
                    ))
            : adapter.accepts === "midi"
                ? MenuItem.default({label: "Add Midi Effect", separatorBefore: true})
                    .setRuntimeChildrenProcedure(parent => parent
                        .addMenuItem(...EffectFactories.MidiList
                            .map(factory => MenuItem.default({
                                label: factory.defaultName,
                                separatorBefore: factory.separatorBefore
                            }).setTriggerProcedure(() => editing.modify(() => api
                                .insertEffect(host.midiEffects.field(), factory, adapter.indexField.getValue() + 1))))
                        )) : panic(`Unknown accepts value: ${adapter.accepts}`)
    }

    const createMenuItemToMoveEffect = ({editing}: Project, host: DeviceHost, adapter: EffectDeviceBoxAdapter) =>
        MenuItem.default({label: "Move Effect"})
            .setRuntimeChildrenProcedure(parent => {
                    const adapters: ReadonlyArray<EffectDeviceBoxAdapter> =
                        adapter.accepts === "audio"
                            ? host.audioEffects.adapters()
                            : adapter.accepts === "midi"
                                ? host.midiEffects.adapters()
                                : panic(`Unknown accept type: ${adapter.accepts}`)
                    const index = adapter.indexField.getValue()
                    return parent.addMenuItem(
                        MenuItem.default({
                            label: "Left",
                            selectable: index > 0
                        }).setTriggerProcedure(() => editing.modify(() => {
                            adapter.indexField.setValue(index - 1)
                            adapters[index - 1].indexField.setValue(index)
                        })),
                        MenuItem.default({
                            label: "Right",
                            selectable: index < adapters.length - 1
                        }).setTriggerProcedure(() => editing.modify(() => {
                            adapter.indexField.setValue(index + 1)
                            adapters[index + 1].indexField.setValue(index)
                        }))
                    )
                }
            )
}
