import {Icon} from "@/ui/components/Icon.tsx"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService"
import {Button} from "@/ui/components/Button.tsx"
import {Lifecycle} from "@opendaw/lib-std"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Colors} from "@opendaw/studio-core"
import {Checkbox} from "@/ui/components/Checkbox"

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const TransportGroup = ({lifecycle, service: {engine, transport}}: Construct) => {
    const playButton: HTMLElement = (
        <Button lifecycle={lifecycle}
                appearance={{activeColor: "hsl(120, 50%, 60%)", tooltip: "Play"}}
                onClick={() => {
                    if (engine.isPlaying().getValue()) {
                        engine.stop()
                    } else {
                        engine.play()
                    }
                }}><Icon symbol={IconSymbol.Play}/></Button>
    )
    const recordButton: HTMLElement = (
        <Button lifecycle={lifecycle}
                appearance={{activeColor: "hsl(0, 50%, 60%)", tooltip: "Recording"}}
                onClick={() => {
                    if (engine.isRecording().getValue()) {
                        engine.stopRecording()
                    } else {
                        engine.startRecording()
                    }
                }}><Icon symbol={IconSymbol.Record}/></Button>)
    lifecycle.ownAll(
        engine.isPlaying().subscribe(owner => playButton.classList.toggle("active", owner.getValue())),
        engine.isRecording().subscribe(owner => recordButton.classList.toggle("active", owner.getValue()))
    )
    return (
        <div style={{display: "flex"}}>
            {recordButton}
            {playButton}
            <Button lifecycle={lifecycle}
                    onClick={() => {engine.stop(true)}}
                    appearance={{activeColor: Colors.bright, tooltip: "Stop"}}>
                <Icon symbol={IconSymbol.Stop}/>
            </Button>
            <Checkbox lifecycle={lifecycle}
                      model={transport.loop}
                      appearance={{activeColor: Colors.gray, tooltip: "Loop"}}>
                <Icon symbol={IconSymbol.Loop}/>
            </Checkbox>
        </div>
    )
}