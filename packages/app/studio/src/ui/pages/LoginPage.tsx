import css from "./LoginPage.sass?inline"
import { createElement } from "@opendaw/lib-jsx"
import { Lifecycle } from "@opendaw/lib-std"
import { Html } from "@opendaw/lib-dom"
import { AuthService } from "@/service/AuthService"

const className = Html.adoptStyleSheet(css, "LoginPage")

type Construct = {
    lifecycle: Lifecycle
    authService: AuthService
}

type AuthMode = 'initial' | 'signin' | 'signup' | 'reset' | 'verification'

export const LoginPage = ({ lifecycle: _lifecycle, authService }: Construct) => {
    let mode: AuthMode = 'initial'
    let email = ''
    let password = ''
    let confirmPassword = ''

    const handleGitHubLogin = async () => {
        try {
            const { error } = await authService.signInWithGithub()
            if (error) {
                showError(`Failed to sign in with GitHub: ${error.message}`)
            }
        } catch (e) {
            showError('Failed to sign in with GitHub. Please try again.')
        }
    }

    const handleGoogleLogin = async () => {
        try {
            const { error } = await authService.signInWithGoogle()
            if (error) {
                showError(`Failed to sign in with Google: ${error.message}`)
            }
        } catch (e) {
            showError('Failed to sign in with Google. Please try again.')
        }
    }

    const validateEmail = (email: string): boolean => {
        // More comprehensive email validation regex (RFC 5322 compliant)
        const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        return re.test(email.trim())
    }

    const validatePassword = (password: string): string | null => {
        if (password.length < 8) {
            return 'Password must be at least 8 characters'
        }
        if (!/[A-Z]/.test(password)) {
            return 'Password must contain at least one uppercase letter'
        }
        if (!/[a-z]/.test(password)) {
            return 'Password must contain at least one lowercase letter'
        }
        if (!/[0-9]/.test(password)) {
            return 'Password must contain at least one number'
        }
        return null
    }

    const handleEmailContinue = async () => {
        // Trim whitespace
        email = email.trim()
        
        if (!email) {
            showError('Please enter your email address')
            return
        }
        
        if (!validateEmail(email)) {
            showError('Please enter a valid email address (e.g., name@example.com)')
            return
        }

        setLoading(true)

        // Check if email exists in the system
        const { exists, error } = await authService.checkEmailExists(email)
        
        setLoading(false)

        if (error) {
            console.error('Error checking email:', error)
            // If RPC fails, default to signup
            mode = 'signup'
            renderMode()
            return
        }

        if (exists) {
            // Email exists -> go to SIGNIN
            mode = 'signin'
            renderMode()
        } else {
            // Email doesn't exist -> go to SIGNUP
            mode = 'signup'
            renderMode()
        }
    }

    const handleSignIn = async () => {
        if (!password) {
            showError('Please enter your password')
            return
        }

        setLoading(true)
        const { error, needsVerification } = await authService.signInWithEmail(email, password)
        setLoading(false)

        if (error) {
            if (needsVerification) {
                mode = 'verification'
                renderMode()
                showError('Please verify your email before signing in')
            } else if (error.message?.includes('Invalid login credentials')) {
                showError('Invalid email or password')
            } else {
                showError(error.message || 'Failed to sign in')
            }
        }
    }

    const handleSignUp = async () => {
        const passwordError = validatePassword(password)
        if (passwordError) {
            showError(passwordError)
            return
        }

        if (password !== confirmPassword) {
            showError('Passwords do not match')
            return
        }

        setLoading(true)
        const { error, needsVerification } = await authService.signUpWithEmail(email, password)
        setLoading(false)

        if (error) {
            if (error.message?.includes('already registered')) {
                showError('This email is already registered. Please sign in instead.')
                mode = 'signin'
                renderMode()
            } else {
                showError(error.message || 'Failed to create account')
            }
        } else if (needsVerification) {
            mode = 'verification'
            renderMode()
            showSuccess('Account created! Please check your email to verify your account.')
        }
    }

    const handlePasswordReset = async () => {
        if (!validateEmail(email)) {
            showError('Please enter a valid email address')
            return
        }

        setLoading(true)
        const { error } = await authService.resetPassword(email)
        setLoading(false)

        if (error) {
            showError(error.message || 'Failed to send reset email')
        } else {
            showSuccess('Password reset email sent! Check your inbox.')
        }
    }

    const handleResendVerification = async () => {
        setLoading(true)
        const { error } = await authService.resendVerificationEmail(email)
        setLoading(false)

        if (error) {
            showError(error.message || 'Failed to resend verification email')
        } else {
            showSuccess('Verification email sent! Check your inbox.')
        }
    }

    const showError = (message: string) => {
        const errorElement = document.querySelector('.message-box')
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.remove('success')
            errorElement.classList.add('error', 'visible')
            
            setTimeout(() => {
                errorElement.classList.remove('visible')
            }, 5000)
        }
    }

    const showSuccess = (message: string) => {
        const errorElement = document.querySelector('.message-box')
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.remove('error')
            errorElement.classList.add('success', 'visible')
            
            setTimeout(() => {
                errorElement.classList.remove('visible')
            }, 5000)
        }
    }

    const setLoading = (loading: boolean) => {
        const buttons = document.querySelectorAll('.auth-button, .email-button')
        buttons.forEach(btn => {
            (btn as HTMLButtonElement).disabled = loading
        })
    }

    const renderMode = () => {
        const container = document.querySelector('.auth-section')
        if (!container) return

        const content = getContentForMode()
        container.innerHTML = ''
        container.appendChild(content)
    }

    const getContentForMode = (): HTMLElement => {
        const modeContent = document.createElement('div')
        
        if (mode === 'initial') {
            modeContent.innerHTML = `
                <p class="description">
                    Sign in to save your projects and access AI-powered music features.
                </p>
                <div class="message-box" role="alert"></div>
                <div class="email-form">
                    <input type="email" class="email-input" placeholder="Enter your email" value="${email}">
                    <button class="email-button" type="button">Continue with Email</button>
                </div>
                <div class="divider">
                    <span>or continue with</span>
                </div>
                <div class="auth-buttons">
                    <button class="auth-button github" type="button">
                        <div class="button-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                        </div>
                        <span>GitHub</span>
                    </button>
                    <button class="auth-button google" type="button">
                        <div class="button-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                        </div>
                        <span>Google</span>
                    </button>
                </div>
            `
            
            modeContent.querySelector('.email-input')!.addEventListener('input', (e) => {
                email = (e.target as HTMLInputElement).value
            })
            modeContent.querySelector('.email-input')!.addEventListener('keypress', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') {
                    handleEmailContinue()
                }
            })
            modeContent.querySelector('.email-button')!.addEventListener('click', handleEmailContinue)
            modeContent.querySelector('.auth-button.github')!.addEventListener('click', handleGitHubLogin)
            modeContent.querySelector('.auth-button.google')!.addEventListener('click', handleGoogleLogin)
            
        } else if (mode === 'signin') {
            modeContent.innerHTML = `
                <button class="back-button" type="button">← Back</button>
                <p class="description">
                    Welcome back! Enter your password to sign in.
                </p>
                <div class="email-display">${email}</div>
                <div class="message-box" role="alert"></div>
                <div class="password-form">
                    <input type="password" class="password-input" placeholder="Password" value="">
                    <button class="email-button" type="button">Sign In</button>
                </div>
                <button class="text-button forgot-password" type="button">Forgot password?</button>
            `
            
            modeContent.querySelector('.back-button')!.addEventListener('click', () => {
                mode = 'initial'
                password = ''
                renderMode()
            })
            modeContent.querySelector('.password-input')!.addEventListener('input', (e) => {
                password = (e.target as HTMLInputElement).value
            })
            modeContent.querySelector('.password-input')!.addEventListener('keypress', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') {
                    handleSignIn()
                }
            })
            modeContent.querySelector('.email-button')!.addEventListener('click', handleSignIn)
            modeContent.querySelector('.forgot-password')!.addEventListener('click', () => {
                mode = 'reset'
                renderMode()
            })
            
        } else if (mode === 'signup') {
            modeContent.innerHTML = `
                <button class="back-button" type="button">← Back</button>
                <p class="description">
                    Create your account. You'll need to verify your email.
                </p>
                <div class="email-display">${email}</div>
                <div class="message-box" role="alert"></div>
                <div class="password-form">
                    <input type="password" class="password-input" placeholder="Create password" value="">
                    <input type="password" class="confirm-password-input" placeholder="Confirm password" value="">
                    <p class="password-hint">At least 8 characters with uppercase, lowercase, and number</p>
                    <button class="email-button" type="button">Create Account</button>
                </div>
            `
            
            modeContent.querySelector('.back-button')!.addEventListener('click', () => {
                mode = 'initial'
                password = ''
                confirmPassword = ''
                renderMode()
            })
            modeContent.querySelector('.password-input')!.addEventListener('input', (e) => {
                password = (e.target as HTMLInputElement).value
            })
            modeContent.querySelector('.confirm-password-input')!.addEventListener('input', (e) => {
                confirmPassword = (e.target as HTMLInputElement).value
            })
            modeContent.querySelector('.confirm-password-input')!.addEventListener('keypress', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') {
                    handleSignUp()
                }
            })
            modeContent.querySelector('.email-button')!.addEventListener('click', handleSignUp)
            
        } else if (mode === 'reset') {
            modeContent.innerHTML = `
                <button class="back-button" type="button">← Back</button>
                <p class="description">
                    Enter your email to receive a password reset link.
                </p>
                <div class="message-box" role="alert"></div>
                <div class="email-form">
                    <input type="email" class="email-input" placeholder="Enter your email" value="${email}">
                    <button class="email-button" type="button">Send Reset Link</button>
                </div>
            `
            
            modeContent.querySelector('.back-button')!.addEventListener('click', () => {
                mode = 'signin'
                renderMode()
            })
            modeContent.querySelector('.email-input')!.addEventListener('input', (e) => {
                email = (e.target as HTMLInputElement).value
            })
            modeContent.querySelector('.email-input')!.addEventListener('keypress', (e) => {
                if ((e as KeyboardEvent).key === 'Enter') {
                    handlePasswordReset()
                }
            })
            modeContent.querySelector('.email-button')!.addEventListener('click', handlePasswordReset)
            
        } else if (mode === 'verification') {
            modeContent.innerHTML = `
                <div class="verification-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                </div>
                <p class="description">
                    <strong>Verify your email</strong><br>
                    We sent a verification link to <strong>${email}</strong>
                </p>
                <div class="message-box" role="alert"></div>
                <p class="verification-note">
                    Click the link in the email to verify your account. You must verify before you can sign in.
                </p>
                <button class="email-button resend" type="button">Resend Verification Email</button>
                <button class="text-button" type="button">Back to Sign In</button>
            `
            
            modeContent.querySelector('.resend')!.addEventListener('click', handleResendVerification)
            modeContent.querySelector('.text-button')!.addEventListener('click', () => {
                mode = 'initial'
                renderMode()
            })
        }
        
        return modeContent
    }

    return (
        <div className={className}>
            <div className="login-container">
                <div className="login-content">
                    <div className="logo-section">
                        <h1>Authenticate</h1>
                        <p className="subtitle">Professional music production in your browser</p>
                    </div>

                    <div className="auth-section">
                        {getContentForMode()}
                    </div>

                    <div className="privacy-note">
                        <p>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            Secure authentication. We never share your data.
                        </p>
                    </div>

                </div>

                <div className="background-animation">
                    <div className="waveform"></div>
                    <div className="waveform"></div>
                    <div className="waveform"></div>
                </div>
            </div>
        </div>
    )
}
