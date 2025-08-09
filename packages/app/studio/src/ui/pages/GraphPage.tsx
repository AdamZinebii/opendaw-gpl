import css from "./GraphPage.sass?inline"
import {Await, createElement, DomElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import type {StudioService} from "@/service/StudioService.ts"
import {GraphData} from "./graph-runtime"
import {ThreeDots} from "@/ui/spinner/ThreeDots"
import {UUID} from "@opendaw/lib-std"

const className = Html.adoptStyleSheet(css, "GraphPage")

export const GraphPage: PageFactory<StudioService> = ({lifecycle, service}: PageContext<StudioService>) => {
    const element: DomElement = (
        <div className={className}>
            <h1>Graph</h1>
            {service.sessionService.getValue().match({
                none: () => "No Project Available",
                some: ({project: {boxGraph}}) => (
                    <Await factory={() => import("./graph-runtime")}
                           failure={({reason}) => (<p>{reason}</p>)}
                           loading={() => (<ThreeDots/>)}
                           success={({createGraphPanel}) => {
                               const stripBoxSuffix = (label?: string) =>
                                   label?.endsWith("Box") ? label.slice(0, -3) : label
                               const boxes = boxGraph.boxes()
                               const data: GraphData = {
                                   nodes: boxes.map(box => ({
                                       id: UUID.toString(box.address.uuid),
                                       label: stripBoxSuffix(box.name)
                                   })),
                                   edges: boxes.flatMap(box => box.outgoingEdges().map(([pointer, address]) => ({
                                       source: UUID.toString(pointer.box.address.uuid),
                                       target: UUID.toString(address.uuid)
                                   })))
                               }
                               const container = <div className="wrapper"/>
                               const controller = createGraphPanel(container, data, {dark: true})
                               lifecycle.own(controller)
                               lifecycle.own(Html.watchResize(element, () => controller.resize()))
                               return container
                           }}/>
                )
            })}
        </div>
    )
    return element
}