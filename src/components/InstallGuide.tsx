import { isIOS, isStandaloneMode } from '../utils/dateUtils'

export const InstallGuide = () => {
  const standalone = isStandaloneMode()
  const ios = isIOS()

  if (standalone) {
    return (
      <section className="install-guide success">
        <h3>已从主屏幕打开</h3>
        <p>现在可以像普通 App 一样使用“三餐提醒”。</p>
      </section>
    )
  }

  if (ios) {
    return (
      <section className="install-guide">
        <h3>添加到 iPhone 主屏幕</h3>
        <ol>
          <li>使用 Safari 打开</li>
          <li>点击底部分享按钮</li>
          <li>选择“添加到主屏幕”</li>
          <li>从桌面打开“三餐提醒”</li>
        </ol>
      </section>
    )
  }

  return (
    <section className="install-guide">
      <h3>安装到桌面</h3>
      <p>如果浏览器地址栏出现安装按钮，可以将它添加到桌面或主屏幕。</p>
    </section>
  )
}
