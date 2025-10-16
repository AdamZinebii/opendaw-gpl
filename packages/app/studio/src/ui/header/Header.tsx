import css from "./Header.sass?inline"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {Lifecycle, Nullable, ObservableValue, Observer, Subscription} from "@opendaw/lib-std"
import {TransportGroup} from "@/ui/header/TransportGroup.tsx"
import {TimeStateDisplay} from "@/ui/header/TimeStateDisplay.tsx"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"
import {createElement, Frag, RouteLocation} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService"
import {AuthService} from "@/service/AuthService"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {Button} from "@/ui/components/Button"
import {Workspace} from "@/ui/workspace/Workspace.ts"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Html} from "@opendaw/lib-dom"
import {MenuItem} from "@/ui/model/menu-item"
import {Colors, MidiDevices} from "@opendaw/studio-core"
import {Manuals} from "@/ui/pages/Manuals"
import {AccountSettingsModal} from "@/ui/components/AccountSettingsModal"

const className = Html.adoptStyleSheet(css, "Header")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    authService?: AuthService
    chatbotToggle?: () => void
}

export const Header = ({lifecycle, service, authService, chatbotToggle}: Construct) => {
    return (
        <header className={className}>
            <MenuButton root={service.menu}
                        appearance={{color: Colors.gray, activeColor: Colors.bright, tinyTriangle: true}}>
                <h5>beatson</h5>
            </MenuButton>
            <hr/>
            <div style={{display: "flex"}}>
                <Checkbox lifecycle={lifecycle}
                          model={MidiDevices.available()}
                          appearance={{activeColor: Colors.orange, tooltip: "Midi Access", cursor: "pointer"}}>
                    <Icon symbol={IconSymbol.Midi}/>
                </Checkbox>
                <MenuButton root={MenuItem.root()
                    .setRuntimeChildrenProcedure(parent => {
                        const helpVisible = service.layout.helpVisible
                        return parent.addMenuItem(
                            MenuItem.header({label: "Manuals", icon: IconSymbol.Help, color: Colors.green}),
                            ...Manuals.slice(1).map(([label, url]) => MenuItem.default({
                                label,
                                checked: RouteLocation.get().path === url
                            }).setTriggerProcedure(() => RouteLocation.get().navigateTo(url))),
                            MenuItem.default({
                                label: "Visible Hints & Tooltips",
                                checked: helpVisible.getValue(),
                                separatorBefore: true
                            }).setTriggerProcedure(() => helpVisible.setValue(!helpVisible.getValue()))
                        )
                    })} appearance={{color: Colors.green, tinyTriangle: true}}>
                    <Icon symbol={IconSymbol.Help}/>
                </MenuButton>
            </div>
            <hr/>
            <TransportGroup lifecycle={lifecycle} service={service}/>
            <hr/>
            <TimeStateDisplay lifecycle={lifecycle} service={service}/>
            {
                location.origin.includes("localhost") && (
                    <Frag>
                        <hr/>
                        <div title="Just a visual indicator to debug a smooth frame-rate"
                             style={{display: "flex", scale: "0.625"}}>
                            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <g className="spinner_GuJz">
                                    <circle cx="3" cy="12" r="2"/>
                                    <circle cx="21" cy="12" r="2"/>
                                    <circle cx="12" cy="21" r="2"/>
                                    <circle cx="12" cy="3" r="2"/>
                                    <circle cx="5.64" cy="5.64" r="2"/>
                                    <circle cx="18.36" cy="18.36" r="2"/>
                                    <circle cx="5.64" cy="18.36" r="2"/>
                                    <circle cx="18.36" cy="5.64" r="2"/>
                                </g>
                            </svg>
                        </div>
                    </Frag>
                )
            }
            <hr/>
            <Checkbox lifecycle={lifecycle}
                      model={service.engine.metronomeEnabled}
                      appearance={{activeColor: Colors.orange, tooltip: "Metronome"}}>
                <Icon symbol={IconSymbol.Metronome}/>
            </Checkbox>
            <hr/>
            {chatbotToggle && (
                <Frag>
                    {(() => {
                        const aiButton = (
                            <Button lifecycle={lifecycle}
                                    onClick={(event) => {
                                        if (!service.hasProfile) {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            return
                                        }
                                        chatbotToggle()
                                    }}
                                    appearance={{
                                        activeColor: Colors.green,
                                        tooltip: "AI Assistant"
                                    }}>
                                AI
                            </Button>
                        ) as HTMLElement
                        
                        lifecycle.own(service.profileService.catchupAndSubscribe(owner => {
                            const isDisabled = owner.getValue().isEmpty()
                            aiButton.classList.toggle("disabled", isDisabled)
                            aiButton.style.pointerEvents = isDisabled ? 'none' : 'auto'
                            aiButton.style.opacity = isDisabled ? '0.5' : '1'
                        }))
                        
                        return aiButton
                    })()}
                    <hr/>
                </Frag>
            )}
            <div style={{flex: "1 0 0"}}/>
            {authService && (() => {
                let modalElement: HTMLElement | null = null
                
                const openModal = () => {
                    if (modalElement) return // Already open
                    
                    modalElement = (
                        <AccountSettingsModal
                            lifecycle={lifecycle}
                            authService={authService}
                            onClose={() => {
                                if (modalElement) {
                                    modalElement.remove()
                                    modalElement = null
                                }
                            }}
                        />
                    ) as HTMLElement
                    
                    document.body.appendChild(modalElement)
                }
                
                const profile = authService.userProfile.getValue()
                const displayName = profile?.username || authService.getUserDisplayName() || 'Account'
                
                return (
                    <Frag>
                        <hr/>
                        <MenuButton root={MenuItem.root()
                            .setRuntimeChildrenProcedure(parent => {
                                const profile = authService.userProfile.getValue()
                                return parent.addMenuItem(
                                    MenuItem.header({
                                        label: profile?.username || authService.getUserDisplayName() || 'Account',
                                        icon: IconSymbol.Robot,
                                        color: Colors.blue
                                    }),
                                    MenuItem.default({
                                        label: "Account Settings",
                                        separatorBefore: true
                                    }).setTriggerProcedure(() => openModal()),
                                    MenuItem.default({
                                        label: "Sign Out"
                                    }).setTriggerProcedure(async () => {
                                        console.log('🔐 Sign out clicked')
                                        const { error } = await authService.signOut()
                                        if (error) {
                                            console.error('Sign out error:', error)
                                        } else {
                                            console.log('✅ Successfully signed out')
                                        }
                                    })
                                )
                            })}
                            appearance={{
                                color: Colors.blue,
                                activeColor: Colors.bright,
                                tinyTriangle: true,
                                tooltip: displayName
                            }}>
                            <span style={{fontSize: "0.875rem", fontWeight: "500"}}>{displayName}</span>
                        </MenuButton>
                    </Frag>
                )
            })()}
            <hr/>
            <Button lifecycle={lifecycle}
                    onClick={() => window.open('https://discord.gg/MG4dHHSHUD', '_blank')}
                    appearance={{framed: true, color: "#5865F2", activeColor: "#4752C4"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: "0.5rem"}}>
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span style={{fontSize: "0.75rem", fontWeight: "500"}}>Discord</span>
            </Button>
            <hr/>
            <RadioGroup lifecycle={lifecycle}
                        model={new class implements ObservableValue<Nullable<Workspace.ScreenKeys>> {
                            setValue(value: Nullable<Workspace.ScreenKeys>): void {
                                if (service.hasProfile) {service.switchScreen(value)}
                            }
                            getValue(): Nullable<Workspace.ScreenKeys> {
                                return service.layout.screen.getValue()
                            }
                            subscribe(observer: Observer<ObservableValue<Nullable<Workspace.ScreenKeys>>>): Subscription {
                                return service.layout.screen.subscribe(observer)
                            }
                            catchupAndSubscribe(observer: Observer<ObservableValue<Nullable<Workspace.ScreenKeys>>>): Subscription {
                                observer(this)
                                return this.subscribe(observer)
                            }
                        }}
                        elements={Object.entries(Workspace.Default)
                            .filter(([_, {hidden}]: [string, Workspace.Screen]) => hidden !== true)
                            .map(([key, {icon: iconSymbol, name}]) => ({
                                value: key,
                                element: <Icon symbol={iconSymbol}/>,
                                tooltip: name
                            }))}
                        appearance={{framed: true, landscape: true}}/>
        </header>
    )
}