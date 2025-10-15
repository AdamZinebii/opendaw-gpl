import css from "./ApplyingLoader.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "ApplyingLoader")

type Construct = {
    lifecycle: Lifecycle
}

export const ApplyingLoader = ({lifecycle: _lifecycle}: Construct) => {
    
    const element: HTMLElement = (
        <div className={className}>
            <div className="loader-backdrop"/>
            <div className="loader-content">
                <div className="spinner"/>
                <h2>Applying to DAW...</h2>
                <p>Merging tracks and arrangements to your project</p>
            </div>
        </div>
    )
    
    return element
}

