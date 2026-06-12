interface ToggleSwitchProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

export const ToggleSwitch = ({ checked, label, onChange }: ToggleSwitchProps) => (
  <button
    type="button"
    className={`toggle-switch ${checked ? 'is-on' : ''}`}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
  >
    <span />
  </button>
)
