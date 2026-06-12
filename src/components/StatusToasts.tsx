interface StatusToastsProps {
  offline: boolean
  saved: boolean
  updateAvailable: boolean
}

export const StatusToasts = ({ offline, saved, updateAvailable }: StatusToastsProps) => (
  <div className="status-toasts" aria-live="polite">
    {offline && <div className="toast">当前离线，已使用本地缓存</div>}
    {saved && <div className="toast">设置已保存</div>}
    {updateAvailable && <div className="toast">新版本已准备好，刷新后生效</div>}
  </div>
)
