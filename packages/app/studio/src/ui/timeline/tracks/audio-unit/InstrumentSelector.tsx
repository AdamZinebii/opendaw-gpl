import css from "./InstrumentSelector.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle} from "@opendaw/lib-std"
import {Html, Events} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {NanoDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {SampleSelector, SampleSelectStrategy} from "@/ui/devices/SampleSelector"

const className = Html.adoptStyleSheet(css, "InstrumentSelector")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: NanoDeviceBoxAdapter
}

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

export const InstrumentSelector = ({lifecycle, service, adapter}: Construct) => {
    const sampleSelector = new SampleSelector(service, SampleSelectStrategy.forPointerField(adapter.box.file))
    
    const currentInstrumentLabel: HTMLElement = <span className="current-instrument">Rhode</span>
    
    // Create dropdown manually to attach to body
    const dropdown = document.createElement('div')
    dropdown.className = 'dropdown'
    dropdown.style.position = 'fixed'
    dropdown.style.background = 'rgba(30, 30, 35, 0.98)'
    dropdown.style.border = '1px solid rgba(255, 255, 255, 0.15)'
    dropdown.style.borderRadius = '8px'
    dropdown.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)'
    dropdown.style.backdropFilter = 'blur(20px)'
    dropdown.style.zIndex = '99999'
    dropdown.style.maxHeight = '0'
    dropdown.style.width = '0'
    dropdown.style.overflow = 'hidden'
    dropdown.style.opacity = '0'
    dropdown.style.visibility = 'hidden'
    dropdown.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.2s'
    dropdown.style.pointerEvents = 'none'
    
    let isDropdownOpen = false
    
    const selectInstrument = async (sample: typeof availableSamples[0]) => {
        console.log(`🎵 Selecting instrument: ${sample.name}`)
        
        try {
            const sampleData = {
                uuid: sample.uuid,
                name: sample.name,
                bpm: 120,
                duration: 3.0,
                sample_rate: 44100
            }
            
            sampleSelector.newSample(sampleData)
            currentInstrumentLabel.textContent = sample.name
            closeDropdown()
            
            console.log(`✅ Instrument changed to: ${sample.name}`)
        } catch (error) {
            console.error('❌ Failed to change instrument:', error)
        }
    }
    
    const updateDropdownPosition = () => {
        if (!isDropdownOpen) return
        const buttonRect = button.getBoundingClientRect()
        dropdown.style.top = `${buttonRect.bottom + 2}px`
        dropdown.style.left = `${buttonRect.left}px`
    }
    
    const openDropdown = () => {
        isDropdownOpen = true
        Html.empty(dropdown)
        
        availableSamples.forEach(sample => {
            const item = document.createElement('div')
            item.className = 'dropdown-item'
            item.textContent = sample.name
            item.style.padding = '8px 12px'
            item.style.fontSize = '11px'
            item.style.color = 'rgba(255, 255, 255, 0.8)'
            item.style.cursor = 'pointer'
            item.style.transition = 'all 0.15s ease'
            item.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)'
            item.onclick = () => selectInstrument(sample)
            
            item.onmouseenter = () => {
                item.style.background = 'rgba(255, 200, 100, 0.15)'
                item.style.color = 'rgba(255, 200, 100, 1)'
                item.style.paddingLeft = '16px'
            }
            item.onmouseleave = () => {
                item.style.background = 'transparent'
                item.style.color = 'rgba(255, 255, 255, 0.8)'
                item.style.paddingLeft = '12px'
            }
            
            dropdown.appendChild(item)
        })
        
        // Position dropdown below button
        updateDropdownPosition()
        
        // Show dropdown
        dropdown.style.maxHeight = '200px'
        dropdown.style.width = '150px'
        dropdown.style.opacity = '1'
        dropdown.style.visibility = 'visible'
        dropdown.style.overflowY = 'auto'
        dropdown.style.overflowX = 'hidden'
        dropdown.style.pointerEvents = 'auto'
        dropdown.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    }
    
    const closeDropdown = () => {
        isDropdownOpen = false
        dropdown.style.maxHeight = '0'
        dropdown.style.width = '0'
        dropdown.style.opacity = '0'
        dropdown.style.visibility = 'hidden'
        dropdown.style.pointerEvents = 'none'
        dropdown.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.2s'
        Html.empty(dropdown)
    }
    
    const toggleDropdown = () => {
        if (isDropdownOpen) {
            closeDropdown()
        } else {
            openDropdown()
        }
    }
    
    const button: HTMLElement = (
        <button className="instrument-button" onclick={toggleDropdown}>
            <span className="label">Instrument:</span>
            {currentInstrumentLabel}
            <svg className="chevron" width="12" height="12" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" fill="currentColor"/>
            </svg>
        </button>
    )
    
    const element: HTMLElement = (
        <div className={className}>
            {button}
        </div>
    )
    
    // Attach dropdown to body to escape parent z-index context
    document.body.appendChild(dropdown)
    
    // Update label when sample changes
    lifecycle.ownAll(
        adapter.box.file.catchupAndSubscribe(pointer => pointer.targetVertex.match({
            none: () => currentInstrumentLabel.textContent = "None",
            some: ({box}) => currentInstrumentLabel.textContent = (box as AudioFileBox).fileName.getValue()
        }))
    )
    
    // Close dropdown when clicking outside
    lifecycle.ownAll(
        Events.subscribe(document, "click", (event) => {
            if (!element.contains(event.target as Node) && !dropdown.contains(event.target as Node)) {
                closeDropdown()
            }
        }),
        // Update dropdown position on scroll
        Events.subscribe(window, "scroll", updateDropdownPosition, true),
        Events.subscribe(window, "resize", updateDropdownPosition),
        // Prevent scroll propagation from dropdown
        Events.subscribe(dropdown, "wheel", (event) => {
            event.stopPropagation()
            const target = event.currentTarget as HTMLElement
            const atTop = target.scrollTop === 0
            const atBottom = target.scrollTop + target.clientHeight >= target.scrollHeight
            
            if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
                event.preventDefault()
            }
        }),
        // Cleanup: remove dropdown from body on terminate
        {
            terminate: () => {
                if (dropdown.parentElement === document.body) {
                    document.body.removeChild(dropdown)
                }
            }
        }
    )
    
    return element
}

