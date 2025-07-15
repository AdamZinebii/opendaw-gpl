import {createElement} from "@opendaw/lib-jsx"
import {IconSymbol, SampleMetaData} from "@opendaw/studio-adapters"
import {Surface} from "@/ui/surface/Surface"
import {Dialog} from "@/ui/components/Dialog"

export namespace AudioDialogs {
    export const showImportSample = async ({
                                               name,
                                               bpm,
                                               duration,
                                               sample_rate
                                           }: SampleMetaData): Promise<SampleMetaData> => {
        const inputField: HTMLInputElement = <input className="default" type="text" placeholder="Enter a name"/>
        inputField.value = name
        inputField.select()
        inputField.focus()
        const {resolve, promise} = Promise.withResolvers<SampleMetaData>()
        const dialog: HTMLDialogElement = (
            <Dialog headline="Import Sample"
                    icon={IconSymbol.System}
                    cancelable={true}
                    buttons={[{
                        text: "Import",
                        primary: true,
                        onClick: handler => {
                            handler.close()
                            resolve({bpm, name: inputField.value, duration, sample_rate})
                        }
                    }]}>
                <div style={{padding: "1em 0", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "1em"}}>
                    <div>Name:</div>
                    {inputField}
                </div>
            </Dialog>
        )
        Surface.get().flyout.appendChild(dialog)
        dialog.showModal()
        return promise
    }
}