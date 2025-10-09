import css from "./Prompter.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {TextButton} from "@/ui/components/TextButton"
import {Button} from "@/ui/components/Button"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Colors} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "Prompter")

type Construct = {
    lifecycle: Lifecycle
    onStartFromScratch: () => void
    onSubmitPrompt: (prompt: string) => void
    isCreating?: boolean
    progress?: number
}

export const Prompter = ({lifecycle, onStartFromScratch, onSubmitPrompt, isCreating = false, progress = 0}: Construct) => {
    const promptInput: HTMLTextAreaElement = (
        <textarea
            className="prompt-input"
            placeholder="Describe your song..."
            rows={3}
        />
    ) as HTMLTextAreaElement

    const handleSubmit = async () => {
        const prompt = promptInput.value.trim()
        if (prompt) {
            // Call song-creator-agent with the prompt
            await onSubmitPrompt(prompt)
        }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            handleSubmit()
        }
    }

    promptInput.addEventListener('keydown', handleKeyDown)

    // Show loading state if creating
    if (isCreating) {
        return (
            <div className={className}>
                <div className="prompter-overlay creating">
                    <div className="loading-content">
                        <h1>✨ Creating your song...</h1>
                        <div className="progress-container">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill" 
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="progress-text">{Math.round(progress)}%</div>
                        </div>
                        <p className="loading-description">
                            🎵 AI is composing tracks, adding effects, and arranging your song...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const presetPrompts = [
        "Create an oldschool hiphop beat with 808s for the bass and a nice piano for the main melody. The mood should be energetic, with a bouncy groove and a classic boom bap drum pattern.",
        "Create an EDM beat with a punchy kick and sidechained synths. Use a bright lead melody with pluck synths and layered pads for atmosphere. The mood should be euphoric and high-energy, perfect for a festival drop.",
        "Create an Afrobeat instrumental with warm 808s for the bass and a rhythmic guitar loop for the main melody. Add percussive elements like shakers and congas to create a groovy, upbeat, danceable mood."
    ]

    const handlePresetClick = (prompt: string) => {
        promptInput.value = prompt
        handleSubmit()
    }

    return (
        <div className={className}>
            <div className="prompter-overlay">
                <div className="prompter-content">
                    <div className="prompter-header">
                        <h1>Create Your Song</h1>
                        <TextButton onClick={onStartFromScratch}>
                            Start from scratch
                        </TextButton>
                    </div>
                    
                    <div className="prompter-body">
                        {promptInput}
                        
                        <div className="preset-prompts">
                            {presetPrompts.map(prompt => (
                                <button 
                                    className="preset-button"
                                    onclick={() => handlePresetClick(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                        
                        <div className="prompter-actions">
                            <Button 
                                lifecycle={lifecycle}
                                onClick={handleSubmit}
                                appearance={{
                                    activeColor: Colors.green,
                                    framed: true
                                }}
                            >
                                <Icon symbol={IconSymbol.Play}/>
                                Generate Song
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
