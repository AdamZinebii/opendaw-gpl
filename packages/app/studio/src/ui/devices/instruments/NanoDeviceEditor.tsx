import css from "./NanoDeviceEditor.sass?inline"
import {asInstanceOf, Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {DeviceHost, IconSymbol, NanoDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {ControlBuilder} from "@/ui/devices/ControlBuilder.tsx"
import {DevicePeakMeter} from "@/ui/devices/panel/DevicePeakMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Icon} from "@/ui/components/Icon"
import {SampleSelector, SampleSelectStrategy} from "@/ui/devices/SampleSelector"
import {StudioService} from "@/service/StudioService"
import {InstrumentFactories} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "NanoDeviceEditor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: NanoDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const NanoDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const {volume, release} = adapter.namedParameter
    const {project, midiLearning} = service
    const {editing} = project
    
    // Available instrument samples
    const availableSamples = [
        { uuid: "c1678daa-4a47-4cba-b88f-4f4e384663c3", name: "Rhode" },
        { uuid: "369a45fc-0c82-4847-a16b-559897067b84", name: "Piano" },
        { uuid: "79e17954-6e14-4915-954c-d5fb640f12f8", name: "Acoustic Guitar" },
        { uuid: "696057c5-f528-4fbf-8bb5-9b86bb60a4fc", name: "Electric Guitar" },
        { uuid: "5f4d250a-bbe1-44b2-bbd8-371d5cbd0c0a", name: "Violin" },
        { uuid: "fe924b7f-55dc-4d60-9b89-5ca7d765355d", name: "Cello" },
        { uuid: "4ce61f3d-7a8d-49b6-b14f-3cc6189175f7", name: "Trumpet" },
        { uuid: "f136af58-8a85-4857-b511-d7828d32a1a7", name: "Saxophone" }
    ]
    let currentSampleIndex = 0
    const sampleDropZone: HTMLElement = (
        <div className="sample-drop">
            <Icon symbol={IconSymbol.Waveform}/>
        </div>
    )
    const sampleSelector = new SampleSelector(service, SampleSelectStrategy.forPointerField(adapter.box.file))
    
    // Cycling function - use same tech as browse() but load from Supabase
    const cycleSample = async () => {
        currentSampleIndex = (currentSampleIndex + 1) % availableSamples.length
        const selectedSample = availableSamples[currentSampleIndex]
        
        console.log(`🎵 Cycling Nano device to: ${selectedSample.name}`)
        console.log(`🔍 UUID: ${selectedSample.uuid}`)
        
        try {
            console.log('🔄 Loading from Supabase...')
            
            // Créer un sample object comme celui retourné par importSample()
            const sample = {
                uuid: selectedSample.uuid,
                name: selectedSample.name,
                bpm: 120, // Default BPM for custom samples
                duration: 3.0, // Default duration in seconds  
                sample_rate: 44100 // Standard sample rate
            }
            
            // Utiliser la MÊME méthode que browse() : newSample() avec stratégie !
            sampleSelector.newSample(sample)
            
            console.log(`✅ Nano device updated via strategy: ${selectedSample.name}`)
            
        } catch (error) {
            console.error('❌ Failed to change Nano sample:', error)
        }
    }
    
    lifecycle.ownAll(
        adapter.box.file.catchupAndSubscribe(pointer => pointer.targetVertex.match({
            none: () => sampleDropZone.removeAttribute("sample"),
            some: ({box}) => sampleDropZone.setAttribute("sample", asInstanceOf(box, AudioFileBox).fileName.getValue())
        })),
        // Replace browse click with cycle click
        (() => {
            sampleDropZone.addEventListener('click', cycleSample)
            return { terminate: () => sampleDropZone.removeEventListener('click', cycleSample) }
        })(),
        sampleSelector.configureContextMenu(sampleDropZone),
        sampleSelector.configureDrop(sampleDropZone)
    )
    return (
        <DeviceEditor lifecycle={lifecycle}
                      project={project}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forAudioUnitInput(parent, service, deviceHost)}
                      populateControls={() => (
                          <div className={className}>
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning: midiLearning,
                                  adapter,
                                  parameter: volume
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning: midiLearning,
                                  adapter,
                                  parameter: release
                              })}
                              {sampleDropZone}
                          </div>
                      )}
                      populateMeter={() => (
                          <DevicePeakMeter lifecycle={lifecycle}
                                           receiver={project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={InstrumentFactories.Nano.defaultIcon}/>
    )
}