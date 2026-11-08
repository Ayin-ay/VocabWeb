import type { CapacitorConfig } from '@capacitor/cli'

/** 壳只加载线上站点：改进站点＝改进 App，APK 本身不带业务代码 */
const HOST = 'vocab-sprint-yc5z6ejvpmh.qoder.website'

const config: CapacitorConfig = {
  appId: 'com.vocab.sprint',
  appName: '词汇冲刺',
  webDir: 'dist',
  server: {
    url: `https://${HOST}`,
    // 这个域留在 App 里导航，桥（原生朗读、返回键、版本）才会注入
    allowNavigation: [HOST]
  },
  android: {
    allowMixedContent: false
  }
}

export default config
