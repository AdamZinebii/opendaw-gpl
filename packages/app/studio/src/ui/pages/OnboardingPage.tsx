import css from "./OnboardingPage.sass?inline"
import { createElement } from "@opendaw/lib-jsx"
import { Lifecycle } from "@opendaw/lib-std"
import { Html } from "@opendaw/lib-dom"
import { AuthService } from "@/service/AuthService"

const className = Html.adoptStyleSheet(css, "OnboardingPage")

type Construct = {
    lifecycle: Lifecycle
    authService: AuthService
    onComplete: () => void
}

export const OnboardingPage = ({ lifecycle: _lifecycle, authService, onComplete }: Construct) => {
    // Prefill username with display name from OAuth provider
    const displayName = authService.getUserDisplayName() || ''
    // Clean display name to match username requirements (remove special chars, spaces, etc.)
    const cleanedDisplayName = displayName.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50)
    
    let username = cleanedDisplayName
    let skillLevel: 'beginner' | 'amateur' | 'professional' | null = null
    let isSubmitting = false

    const validateUsername = (value: string): string | null => {
        if (!value || value.trim().length === 0) {
            return 'Username is required'
        }
        if (value.length < 3) {
            return 'Username must be at least 3 characters'
        }
        if (value.length > 50) {
            return 'Username must be less than 50 characters'
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return 'Username can only contain letters, numbers, hyphens, and underscores'
        }
        return null
    }

    const handleSubmit = async () => {
        if (isSubmitting) return

        // Validate username
        const usernameError = validateUsername(username)
        if (usernameError) {
            showError(usernameError)
            return
        }

        // Validate skill level
        if (!skillLevel) {
            showError('Please select your skill level')
            return
        }

        isSubmitting = true
        updateSubmitButton(true)

        try {
            const result = await authService.completeOnboarding({
                username: username.trim(),
                skill_level: skillLevel
            })

            if (result.success) {
                console.log('✅ Onboarding completed successfully')
                onComplete()
            } else {
                showError(result.error || 'Failed to complete onboarding')
                isSubmitting = false
                updateSubmitButton(false)
            }
        } catch (error) {
            console.error('❌ Onboarding error:', error)
            showError('An unexpected error occurred. Please try again.')
            isSubmitting = false
            updateSubmitButton(false)
        }
    }

    const showError = (message: string) => {
        const errorElement = document.querySelector(`.${className} .error-message`)
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.add('visible')
            
            setTimeout(() => {
                errorElement.classList.remove('visible')
            }, 5000)
        }
    }

    const updateSubmitButton = (submitting: boolean) => {
        const button = document.querySelector(`.${className} .submit-button`) as HTMLButtonElement
        if (button) {
            button.disabled = submitting
            button.textContent = submitting ? 'Setting up...' : 'Get Started'
        }
    }

    return (
        <div className={className}>
            <div className="onboarding-container">
                <div className="onboarding-content">
                    <div className="header-section">
                        <h1>Welcome to beatson</h1>
                        <p className="subtitle">Let's set up your profile to get started</p>
                    </div>

                    <div className="form-section">
                        <div className="error-message" role="alert"></div>

                        <div className="form-group">
                            <label htmlFor="username">Choose Your Username</label>
                            <input
                                type="text"
                                id="username"
                                className="username-input"
                                placeholder="musicmaker123"
                                value={username}
                                maxLength={50}
                                oninput={(e: Event) => {
                                    const target = e.target as HTMLInputElement
                                    username = target.value
                                }}
                                onkeydown={(e: KeyboardEvent) => {
                                    if (e.key === 'Enter') {
                                        handleSubmit()
                                    }
                                }}
                            />
                            <p className="field-hint">
                                3-50 characters. Letters, numbers, hyphens, and underscores only.
                            </p>
                        </div>

                        <div className="form-group">
                            <label>Music Production Level</label>
                            <div className="skill-options">
                                <button
                                    type="button"
                                    className="skill-option"
                                    onclick={(e: Event) => {
                                        const target = e.currentTarget as HTMLElement
                                        document.querySelectorAll(`.${className} .skill-option`).forEach(el => {
                                            el.classList.remove('selected')
                                        })
                                        target.classList.add('selected')
                                        skillLevel = 'beginner'
                                    }}
                                >
                                    <div className="skill-name">Beginner</div>
                                    <div className="skill-description">Just starting out</div>
                                </button>

                                <button
                                    type="button"
                                    className="skill-option"
                                    onclick={(e: Event) => {
                                        const target = e.currentTarget as HTMLElement
                                        document.querySelectorAll(`.${className} .skill-option`).forEach(el => {
                                            el.classList.remove('selected')
                                        })
                                        target.classList.add('selected')
                                        skillLevel = 'amateur'
                                    }}
                                >
                                    <div className="skill-name">Amateur</div>
                                    <div className="skill-description">Know the basics</div>
                                </button>

                                <button
                                    type="button"
                                    className="skill-option"
                                    onclick={(e: Event) => {
                                        const target = e.currentTarget as HTMLElement
                                        document.querySelectorAll(`.${className} .skill-option`).forEach(el => {
                                            el.classList.remove('selected')
                                        })
                                        target.classList.add('selected')
                                        skillLevel = 'professional'
                                    }}
                                >
                                    <div className="skill-name">Professional</div>
                                    <div className="skill-description">Experienced producer</div>
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="submit-button"
                            onclick={handleSubmit}
                        >
                            Get Started
                        </button>
                    </div>

                    <div className="footer-note">
                        <p>You can always update your profile later in settings</p>
                    </div>
                </div>

            </div>
        </div>
    )
}

