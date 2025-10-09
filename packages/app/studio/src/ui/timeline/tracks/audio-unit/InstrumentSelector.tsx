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
    // Keyboards & Synths
    { uuid: "c1678daa-4a47-4cba-b88f-4f4e384663c3", name: "Rhodes Piano" },
    { uuid: "369a45fc-0c82-4847-a16b-559897067b84", name: "Acoustic Piano" },
    { uuid: "f6d85615-dff3-4711-9aa9-8a13c5e870be", name: "Organ" },
    { uuid: "0566cf24-ce4e-4aa2-945f-f57e8a75e29a", name: "808 Bass Synth" },
    { uuid: "d6a15d71-90cb-4765-af05-8efd08979b5d", name: "Synth Bass" },
    
    // Guitars
    { uuid: "79e17954-6e14-4915-954c-d5fb640f12f8", name: "Acoustic Guitar" },
    { uuid: "696057c5-f528-4fbf-8bb5-9b86bb60a4fc", name: "Electric Guitar" },
    
    // Strings
    { uuid: "5f4d250a-bbe1-44b2-bbd8-371d5cbd0c0a", name: "Violin" },
    { uuid: "fe924b7f-55dc-4d60-9b89-5ca7d765355d", name: "Cello" },
    { uuid: "a5a3aa17-1133-4ff6-829e-e79a33eee663", name: "Harp" },
    
    // Brass & Woodwinds
    { uuid: "4ce61f3d-7a8d-49b6-b14f-3cc6189175f7", name: "Trumpet" },
    { uuid: "f136af58-8a85-4857-b511-d7828d32a1a7", name: "Saxophone" },
    { uuid: "ef0e4961-7546-4ed9-b35a-ff0229c43c67", name: "Pan Flute" },
    { uuid: "300c12e7-e711-46d3-a34d-97a5cd371012", name: "Whistle" },
    
    // Percussion & Mallets
    { uuid: "a7b0b263-b865-4588-b5bb-22d4aa8284d6", name: "Xylophone" },
    { uuid: "a7aaf1ac-93a8-4c3a-9996-cc98a9757626", name: "Bell" },
    
    // Vocals
    { uuid: "5803af42-e640-43d6-95e0-46752f22b82a", name: "Choir" }
]

export const InstrumentSelector = ({lifecycle, service, adapter}: Construct) => {
    const sampleSelector = new SampleSelector(service, SampleSelectStrategy.forPointerField(adapter.box.file))
    
    const currentInstrumentLabel: HTMLElement = <span className="current-instrument">Rhodes Piano</span>
    const dropdown: HTMLElement = <div className="InstrumentSelector-dropdown"/>
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
        console.log('🔵 Opening dropdown...')
        isDropdownOpen = true
        Html.empty(dropdown)
        
        availableSamples.forEach(sample => {
            const item: HTMLElement = (
                <div className="dropdown-item" onclick={() => selectInstrument(sample)}>
                    {sample.name}
                </div>
            )
            dropdown.appendChild(item)
        })
        
        // Position dropdown below button
        updateDropdownPosition()
        
        const buttonRect = button.getBoundingClientRect()
        console.log('📍 Button position:', {
            top: buttonRect.bottom + 2,
            left: buttonRect.left,
            isInBody: dropdown.parentElement === document.body
        })
        
        dropdown.classList.add('open')
        console.log('✅ Dropdown opened, classList:', dropdown.classList.toString())
        console.log('✅ Dropdown style:', {
            top: dropdown.style.top,
            left: dropdown.style.left,
            width: dropdown.style.width,
            display: window.getComputedStyle(dropdown).display,
            visibility: window.getComputedStyle(dropdown).visibility,
            opacity: window.getComputedStyle(dropdown).opacity
        })
    }
    
    const closeDropdown = () => {
        isDropdownOpen = false
        dropdown.classList.remove('open')
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
    
    // Close dropdown when clicking outside and handle scroll
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
