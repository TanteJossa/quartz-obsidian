import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import passwordScript from "./scripts/password.inline"
// @ts-ignore
import passwordStyle from "./styles/password.scss"

const PasswordProtection: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  return (
    <div id="password-protection-container">
      {/* The password protection logic is handled by the inline script */}
    </div>
  )
}

PasswordProtection.beforeDOMLoaded = passwordScript
PasswordProtection.css = passwordStyle

export default (() => PasswordProtection) satisfies QuartzComponentConstructor
