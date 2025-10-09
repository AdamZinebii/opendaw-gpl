import css from "./AccountSettingsModal.sass?inline"
import { createElement } from "@opendaw/lib-jsx"
import { Lifecycle } from "@opendaw/lib-std"
import { Html } from "@opendaw/lib-dom"
import { AuthService } from "@/service/AuthService"

const className = Html.adoptStyleSheet(css, "AccountSettingsModal")

type Construct = {
    lifecycle: Lifecycle
    authService: AuthService
    onClose: () => void
}

export const AccountSettingsModal = ({ lifecycle: _lifecycle, authService, onClose }: Construct) => {
    const profile = authService.userProfile.getValue()
    if (!profile) {
        onClose()
        return <div></div> as HTMLElement
    }

    let username = profile.username || ''
    let skillLevel: 'beginner' | 'amateur' | 'professional' | null = profile.skill_level
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

        const usernameError = validateUsername(username)
        if (usernameError) {
            showError(usernameError)
            return
        }

        if (!skillLevel) {
            showError('Please select your skill level')
            return
        }

        isSubmitting = true
        updateSubmitButton(true)

        try {
            const result = await authService.updateProfile({
                username: username.trim(),
                skill_level: skillLevel
            })

            if (result.success) {
                console.log('✅ Profile updated successfully')
                showSuccess('Profile updated successfully!')
                setTimeout(() => {
                    onClose()
                }, 1000)
            } else {
                showError(result.error || 'Failed to update profile')
                isSubmitting = false
                updateSubmitButton(false)
            }
        } catch (error) {
            console.error('❌ Profile update error:', error)
            showError('An unexpected error occurred. Please try again.')
            isSubmitting = false
            updateSubmitButton(false)
        }
    }

    const showError = (message: string) => {
        const errorElement = modalOverlay.querySelector('.error-message')
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.remove('success')
            errorElement.classList.add('visible')
            
            setTimeout(() => {
                errorElement.classList.remove('visible')
            }, 5000)
        }
    }

    const showSuccess = (message: string) => {
        const errorElement = modalOverlay.querySelector('.error-message')
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.add('success')
            errorElement.classList.add('visible')
        }
    }

    const updateSubmitButton = (submitting: boolean) => {
        const button = modalOverlay.querySelector('.submit-button') as HTMLButtonElement
        if (button) {
            button.disabled = submitting
            button.textContent = submitting ? 'Saving...' : 'Save Changes'
        }
    }

    const modalOverlay = document.createElement('div')
    modalOverlay.className = className
    modalOverlay.onclick = (e: Event) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    const modalContent = document.createElement('div')
    modalContent.className = 'modal-content'

    const modalHeader = document.createElement('div')
    modalHeader.className = 'modal-header'
    modalHeader.innerHTML = `
        <h3>Account Settings</h3>
        <button class="close-button">×</button>
    `
    modalHeader.querySelector('.close-button')!.addEventListener('click', onClose)

    const modalBody = document.createElement('div')
    modalBody.className = 'modal-body'

    // Error message
    const errorMessage = document.createElement('div')
    errorMessage.className = 'error-message'
    errorMessage.setAttribute('role', 'alert')
    modalBody.appendChild(errorMessage)

    // Username field
    const usernameGroup = document.createElement('div')
    usernameGroup.className = 'form-group'
    
    const usernameLabel = document.createElement('label')
    usernameLabel.setAttribute('for', 'username-edit')
    usernameLabel.textContent = 'Username'
    
    const usernameInput = document.createElement('input')
    usernameInput.type = 'text'
    usernameInput.id = 'username-edit'
    usernameInput.className = 'username-input'
    usernameInput.value = username
    usernameInput.maxLength = 50
    usernameInput.oninput = (e: Event) => {
        const target = e.target as HTMLInputElement
        username = target.value
    }
    usernameInput.onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit()
        }
    }
    
    const usernameHint = document.createElement('p')
    usernameHint.className = 'field-hint'
    usernameHint.textContent = '3-50 characters. Letters, numbers, hyphens, and underscores only.'
    
    usernameGroup.appendChild(usernameLabel)
    usernameGroup.appendChild(usernameInput)
    usernameGroup.appendChild(usernameHint)
    modalBody.appendChild(usernameGroup)

    // Skill level field
    const skillGroup = document.createElement('div')
    skillGroup.className = 'form-group'
    
    const skillLabel = document.createElement('label')
    skillLabel.textContent = 'Music Production Level'
    
    const skillOptions = document.createElement('div')
    skillOptions.className = 'skill-options'
    
    const createSkillButton = (level: 'beginner' | 'amateur' | 'professional', name: string, desc: string) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'skill-option'
        if (skillLevel === level) {
            btn.classList.add('selected')
        }
        
        const skillName = document.createElement('div')
        skillName.className = 'skill-name'
        skillName.textContent = name
        
        const skillDesc = document.createElement('div')
        skillDesc.className = 'skill-description'
        skillDesc.textContent = desc
        
        btn.appendChild(skillName)
        btn.appendChild(skillDesc)
        
        btn.onclick = () => {
            skillOptions.querySelectorAll('.skill-option').forEach(el => {
                el.classList.remove('selected')
            })
            btn.classList.add('selected')
            skillLevel = level
        }
        
        return btn
    }
    
    skillOptions.appendChild(createSkillButton('beginner', 'Beginner', 'Just starting out'))
    skillOptions.appendChild(createSkillButton('amateur', 'Amateur', 'Know the basics'))
    skillOptions.appendChild(createSkillButton('professional', 'Professional', 'Experienced producer'))
    
    skillGroup.appendChild(skillLabel)
    skillGroup.appendChild(skillOptions)
    modalBody.appendChild(skillGroup)

    // Buttons
    const buttonGroup = document.createElement('div')
    buttonGroup.className = 'button-group'
    
    const cancelButton = document.createElement('button')
    cancelButton.type = 'button'
    cancelButton.className = 'cancel-button'
    cancelButton.textContent = 'Cancel'
    cancelButton.onclick = onClose
    
    const submitButton = document.createElement('button')
    submitButton.type = 'button'
    submitButton.className = 'submit-button'
    submitButton.textContent = 'Save Changes'
    submitButton.onclick = handleSubmit
    
    buttonGroup.appendChild(cancelButton)
    buttonGroup.appendChild(submitButton)
    modalBody.appendChild(buttonGroup)

    // Assemble modal
    modalContent.appendChild(modalHeader)
    modalContent.appendChild(modalBody)
    modalOverlay.appendChild(modalContent)
    
    return modalOverlay
}
