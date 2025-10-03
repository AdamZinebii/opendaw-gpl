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
                            MenuItem.header({label: "Manuals", icon: IconSymbol.OpenDAW, color: Colors.green}),
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
            {authService && (
                <Frag>
                    <hr/>
                    <Button lifecycle={lifecycle}
                            onClick={async () => {
                                console.log('🔐 Sign out clicked')
                                const { error } = await authService.signOut()
                                if (error) {
                                    console.error('Sign out error:', error)
                                } else {
                                    console.log('✅ Successfully signed out')
                                }
                            }}
                            appearance={{
                                activeColor: Colors.red,
                                tooltip: `Sign out (${authService.getCurrentUser()?.email || 'User'})`
                            }}>
                        <Icon symbol={IconSymbol.Close}/>
                    </Button>
                </Frag>
            )}
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