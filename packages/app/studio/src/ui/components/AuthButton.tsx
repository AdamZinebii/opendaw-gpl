import css from "./AuthButton.sass?inline"
import { createElement } from "@opendaw/lib-jsx"
import { Lifecycle, Terminator } from "@opendaw/lib-std"
import { Html } from "@opendaw/lib-dom"
import { AuthService } from "@/service/AuthService"
import { Button } from "./Button"
import { MenuButton } from "./MenuButton"
import { MenuItem } from "@/ui/model/menu-item"
import { Colors } from "@opendaw/studio-core"
import { Icon } from "./Icon"
import { IconSymbol } from "@opendaw/studio-adapters"

const className = Html.adoptStyleSheet(css, "AuthButton")

type Construct = {
    lifecycle: Lifecycle
    authService: AuthService
}

export const AuthButton = ({ lifecycle, authService }: Construct) => {
    const terminator = lifecycle.own(new Terminator())
    let buttonElement: HTMLElement = document.createElement('div')
    
    const render = (): HTMLElement => {
        const user = authService.getCurrentUser()
        const loading = authService.loading.getValue()
        
        if (loading) {
            return (
                <div className={`${className} loading`}>
                    <span>...</span>
                </div>
            ) as HTMLElement
        }
        
        if (!user) {
            return (
                <Button lifecycle={terminator}
                        onClick={() => showLoginModal()}
                        appearance={{ 
                            activeColor: Colors.green, 
                            tooltip: "Sign In" 
                        }}>
                    <Icon symbol={IconSymbol.Robot}/>
                </Button>
            ) as HTMLElement
        } else {
            const displayName = authService.getUserDisplayName() || 'User'
            const avatar = authService.getUserAvatar()
            
            return (
                <MenuButton root={MenuItem.root()
                               .setRuntimeChildrenProcedure(parent => {
                                   return parent.addMenuItem(
                                       MenuItem.header({ 
                                           label: displayName, 
                                           icon: IconSymbol.Robot, 
                                           color: Colors.green 
                                       }),
                                       MenuItem.default({
                                           label: "Sign Out",
                                           separatorBefore: true
                                       }).setTriggerProcedure(async () => {
                                           const { error } = await authService.signOut()
                                           if (error) {
                                               console.error('Sign out error:', error)
                                           }
                                       })
                                   )
                               })}
                           appearance={{ 
                               color: Colors.green, 
                               activeColor: Colors.bright, 
                               tinyTriangle: true,
                               tooltip: displayName
                           }}>
                    <div className={`${className} user-info`}>
                        {avatar ? (
                            <img src={avatar} alt={displayName} className="avatar" />
                        ) : (
                            <Icon symbol={IconSymbol.Robot}/>
                        )}
                    </div>
                </MenuButton>
            ) as HTMLElement
        }
    }
    
    const showLoginModal = () => {
        // Create modal overlay
        const modal = document.createElement('div')
        modal.className = `${className} modal-overlay`
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove()
            }
        }
        
        let email = ''
        let password = ''
        let mode: 'initial' | 'signin' | 'signup' = 'initial'
        
        const showError = (message: string) => {
            const errorEl = modal.querySelector('.error-message')
            if (errorEl) {
                errorEl.textContent = message
                errorEl.classList.add('visible')
                setTimeout(() => errorEl.classList.remove('visible'), 5000)
            }
        }
        
        const showSuccess = (message: string) => {
            const errorEl = modal.querySelector('.error-message')
            if (errorEl) {
                errorEl.textContent = message
                errorEl.classList.remove('error')
                errorEl.classList.add('success', 'visible')
                setTimeout(() => errorEl.classList.remove('visible'), 3000)
            }
        }
        
        const handleEmailContinue = async () => {
            // Trim whitespace
            email = email.trim()
            
            if (!email) {
                showError('Please enter your email address')
                return
            }
            
            // Improved email validation
            const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
            
            if (!emailRegex.test(email)) {
                showError('Please enter a valid email (e.g., name@example.com)')
                return
            }
            
            // Check if email exists in the system
            const { exists, error } = await authService.checkEmailExists(email)
            
            if (error) {
                console.error('Error checking email:', error)
                // If RPC fails, default to signup
                mode = 'signup'
                renderModalContent()
                return
            }
            
            if (exists) {
                // Email exists -> go to SIGNIN
                mode = 'signin'
                renderModalContent()
            } else {
                // Email doesn't exist -> go to SIGNUP
                mode = 'signup'
                renderModalContent()
            }
        }
        
        const handleSignIn = async () => {
            const { error } = await authService.signInWithEmail(email, password)
            if (error) {
                if (error.message?.includes('Email not confirmed')) {
                    showError('Please verify your email first')
                } else {
                    showError('Invalid email or password')
                }
            } else {
                modal.remove()
            }
        }
        
        const handleSignUp = async () => {
            if (password.length < 8) {
                showError('Password must be at least 8 characters')
                return
            }
            
            const { error, needsVerification } = await authService.signUpWithEmail(email, password)
            if (error) {
                showError(error.message || 'Failed to create account')
            } else if (needsVerification) {
                showSuccess('Account created! Check your email to verify.')
                setTimeout(() => modal.remove(), 3000)
            }
        }
        
        const renderModalContent = () => {
            const body = modal.querySelector('.modal-body')
            if (!body) return
            
            if (mode === 'initial') {
                body.innerHTML = `
                    <p>Sign in to save your projects and access them anywhere</p>
                    <div class="error-message"></div>
                    <div class="email-form-compact">
                        <input type="email" class="email-input-compact" placeholder="Email" value="">
                        <button class="email-button-compact">Continue</button>
                    </div>
                    <div class="divider-compact"><span>or</span></div>
                    <div class="auth-buttons">
                        <button class="auth-button github">
                            <span class="icon-text">GH</span>
                            GitHub
                        </button>
                        <button class="auth-button google">
                            <span class="icon-text">G</span>
                            Google
                        </button>
                    </div>
                `
                
                body.querySelector('.email-input-compact')!.addEventListener('input', (e) => {
                    email = (e.target as HTMLInputElement).value
                })
                body.querySelector('.email-input-compact')!.addEventListener('keypress', (e) => {
                    if ((e as KeyboardEvent).key === 'Enter') handleEmailContinue()
                })
                body.querySelector('.email-button-compact')!.addEventListener('click', handleEmailContinue)
                body.querySelector('.auth-button.github')!.addEventListener('click', async () => {
                    const { error } = await authService.signInWithGithub()
                    if (!error) modal.remove()
                })
                body.querySelector('.auth-button.google')!.addEventListener('click', async () => {
                    const { error } = await authService.signInWithGoogle()
                    if (!error) modal.remove()
                })
            } else if (mode === 'signin') {
                body.innerHTML = `
                    <button class="back-btn-compact">← Back</button>
                    <p>Enter your password</p>
                    <div class="email-display-compact">${email}</div>
                    <div class="error-message"></div>
                    <div class="password-form-compact">
                        <input type="password" class="password-input-compact" placeholder="Password">
                        <button class="email-button-compact">Sign In</button>
                    </div>
                `
                
                body.querySelector('.back-btn-compact')!.addEventListener('click', () => {
                    mode = 'initial'
                    password = ''
                    renderModalContent()
                })
                body.querySelector('.password-input-compact')!.addEventListener('input', (e) => {
                    password = (e.target as HTMLInputElement).value
                })
                body.querySelector('.password-input-compact')!.addEventListener('keypress', (e) => {
                    if ((e as KeyboardEvent).key === 'Enter') handleSignIn()
                })
                body.querySelector('.email-button-compact')!.addEventListener('click', handleSignIn)
            } else if (mode === 'signup') {
                body.innerHTML = `
                    <button class="back-btn-compact">← Back</button>
                    <p>Create your account</p>
                    <div class="email-display-compact">${email}</div>
                    <div class="error-message"></div>
                    <div class="password-form-compact">
                        <input type="password" class="password-input-compact" placeholder="Create password (8+ chars)">
                        <button class="email-button-compact">Create Account</button>
                    </div>
                `
                
                body.querySelector('.back-btn-compact')!.addEventListener('click', () => {
                    mode = 'initial'
                    password = ''
                    renderModalContent()
                })
                body.querySelector('.password-input-compact')!.addEventListener('input', (e) => {
                    password = (e.target as HTMLInputElement).value
                })
                body.querySelector('.password-input-compact')!.addEventListener('keypress', (e) => {
                    if ((e as KeyboardEvent).key === 'Enter') handleSignUp()
                })
                body.querySelector('.email-button-compact')!.addEventListener('click', handleSignUp)
            }
        }
        
        const modalContent = (
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Sign In to beatson</h3>
                    <button 
                        className="close-button"
                        onclick={() => modal.remove()}>
                        ×
                    </button>
                </div>
                <div className="modal-body">
                </div>
            </div>
        ) as HTMLElement
        
        modal.appendChild(modalContent)
        document.body.appendChild(modal)
        renderModalContent()
    }
    
    // Re-render when auth state changes
    lifecycle.own(authService.user.catchupAndSubscribe(() => {
        terminator.terminate()
        const newElement = render()
        buttonElement.replaceWith(newElement)
        buttonElement = newElement
    }))
    
    buttonElement = render()
    return buttonElement
}
