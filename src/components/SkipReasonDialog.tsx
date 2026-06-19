import type { SkipReason } from '../types/checkin'

interface SkipReasonDialogProps {
  open: boolean
  disabled: boolean
  onClose: () => void
  onSelect: (reason: SkipReason) => void
}

const reasons: Array<{ value: SkipReason; label: string }> = [
  { value: 'already_ate', label: '已经吃过了' },
  { value: 'not_hungry', label: '今天不饿' },
  { value: 'unwell', label: '身体不舒服' },
  { value: 'inconvenient', label: '时间不方便' },
  { value: 'other', label: '其他' },
]

export const SkipReasonDialog = ({ open, disabled, onClose, onSelect }: SkipReasonDialogProps) => {
  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="skip-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skip-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="skip-dialog-title">跳过原因</h2>
        <div className="skip-reason-list">
          {reasons.map((reason) => (
            <button
              key={reason.value}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(reason.value)}
            >
              {reason.label}
            </button>
          ))}
        </div>
        <button type="button" className="secondary-action" disabled={disabled} onClick={onClose}>
          取消
        </button>
      </section>
    </div>
  )
}
