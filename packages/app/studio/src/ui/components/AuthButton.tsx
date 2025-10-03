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
                    <p>Sign in to save your projects and access them anywhere</p>
                    <div className="auth-buttons">
                        <button 
                            className="auth-button github"
                            onclick={async () => {
                                const { error } = await authService.signInWithGithub()
                                if (error) {
                                    console.error('GitHub sign in error:', error)
                                } else {
                                    modal.remove()
                                }
                            }}>
                            <span className="icon-text">GH</span>
                            Continue with GitHub
                        </button>
                        <button 
                            className="auth-button google"
                            onclick={async () => {
                                const { error } = await authService.signInWithGoogle()
                                if (error) {
                                    console.error('Google sign in error:', error)
                                } else {
                                    modal.remove()
                                }
                            }}>
                            <span className="icon-text">G</span>
                            Continue with Google
                        </button>
                    </div>
                </div>
            </div>
        ) as HTMLElement
        
        modal.appendChild(modalContent)
        document.body.appendChild(modal)
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
