import css from "./Dialog.sass?inline"
import {Exec, Procedure, safeExecute, Terminator} from "@opendaw/lib-std"
import {createElement, JsxValue} from "@opendaw/lib-jsx"
import {Button} from "@/ui/components/Button.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Events, Html} from "@opendaw/lib-dom"
import {Colors} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "Dialog")

export interface DialogHandler {
    close(): void
}

export type Button = {
    text: string
    onClick: Procedure<DialogHandler>
    primary?: boolean
}

type Construct = {
    headline: string
    icon?: IconSymbol
    onCancel?: Exec
    cancelable?: boolean
    buttons?: ReadonlyArray<Button>
    style?: Partial<CSSStyleDeclaration>
    error?: boolean
}

export const Dialog = (
    {headline, icon, onCancel, buttons, cancelable, style, error}: Construct, children: JsxValue) => {
    const lifecycle = new Terminator()
    const dialog: HTMLDialogElement = (
        <dialog className={Html.buildClassList(className, error && "error")} style={style}>
            <div className="dialog-header">
                <h1>
                    {icon && <Icon symbol={icon}/>}
                    <span>{headline}</span>
                </h1>
                {cancelable && (
                    <button className="close-button" onclick={() => dialog.close()}>
                        <Icon symbol={IconSymbol.Close}/>
                    </button>
                )}
            </div>
            {children}
            {buttons && buttons.length > 0 && (
                <footer>
                    {buttons.map(({onClick, primary, text}) => (
                        <Button lifecycle={lifecycle}
                                onClick={() => onClick({close: () => dialog.close()})}
                                appearance={primary === true ? {
                                    framed: true,
                                    color: Colors.blue
                                } : {
                                    color: Colors.gray
                                }}><span>{text}</span></Button>
                    ))}
                </footer>
            )}
        </dialog>
    )
    if (cancelable === false) {
        dialog.oncancel = (event) => event.preventDefault()
    }
    dialog.onkeydown = (event) => {
        if (!(cancelable === true && event.key === "Escape") && !Events.isTextInput(event.target)) {
            if (event.code !== "F12") {
                event.preventDefault()
            }
            event.stopPropagation()
        }
    }
    dialog.onclose = () => {
        lifecycle.terminate()
        if (dialog.returnValue === "") {
            safeExecute(onCancel)
        }
        dialog.remove()
    }
    return dialog
}