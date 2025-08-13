import css from "./CountIn.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {Lifecycle, Terminable} from "@opendaw/lib-std"
import {createElement, DomElement} from "@opendaw/lib-jsx"
import {Engine} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "CountIn")

type Construct = {
    lifecycle: Lifecycle
    engine: Engine
}

export const CountIn = ({lifecycle, engine}: Construct) => {
    const textElement: SVGTextElement = (
        <text x="50%" y="50%" dy="0.08em"
              font-size="64"
              text-anchor="middle"
              dominant-baseline="middle"
              fill="black"/>
    )
    const maskId = Html.nextID()
    const element: DomElement = (
        <svg classList={className} viewBox="0 0 100 100" width={100} height={100}>
            <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse">
                    <circle cx="50" cy="50" r="50" fill="white"/>
                    {textElement}
                </mask>
            </defs>
            <circle cx="50" cy="50" r="50" fill="white" mask={`url(#${maskId})`}/>
        </svg>
    )
    lifecycle.ownAll(
        engine.countInBeatsRemaining
            .catchupAndSubscribe(owner => textElement.textContent = (owner.getValue() + 1).toString()),
        Terminable.create(() => element.remove())
    )
    return element
}