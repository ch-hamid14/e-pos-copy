import type { ThemeConfig } from 'antd'

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',
    colorPrimaryHover: '#1d4ed8',
    colorPrimaryActive: '#1e40af',
    colorLink: '#2563eb',
    colorLinkHover: '#1d4ed8',
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    controlHeight: 38,
    controlHeightLG: 44,
    controlHeightSM: 32,
    boxShadow:
      '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.04)',
    boxShadowSecondary:
      '0 8px 24px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)'
  },
  components: {
    Button: {
      fontWeight: 500,
      primaryColor: '#ffffff',
      primaryShadow: '0 2px 8px rgba(37, 99, 235, 0.28)',
      defaultShadow: 'none',
      defaultBorderColor: '#e2e8f0',
      defaultColor: '#334155',
      paddingInline: 18,
      paddingInlineLG: 22,
      contentFontSizeLG: 15,
      borderRadius: 8,
      borderRadiusLG: 10,
      controlHeight: 38,
      controlHeightLG: 44
    },
    Modal: {
      titleFontSize: 18,
      titleLineHeight: 1.35,
      borderRadiusLG: 14,
      paddingContentHorizontalLG: 24,
      paddingMD: 20,
      boxShadow: '0 24px 48px rgba(15, 23, 42, 0.14), 0 8px 16px rgba(15, 23, 42, 0.06)'
    },
    Input: {
      activeBorderColor: '#2563eb',
      hoverBorderColor: '#93c5fd',
      paddingInline: 14,
      borderRadius: 8
    },
    Select: {
      optionSelectedBg: '#eff6ff',
      borderRadius: 8
    },
    Form: {
      labelColor: '#475569',
      labelFontSize: 13,
      verticalLabelPadding: '0 0 6px'
    },
    Card: {
      borderRadiusLG: 12,
      boxShadowTertiary: '0 1px 2px rgba(15, 23, 42, 0.05), 0 4px 12px rgba(15, 23, 42, 0.04)'
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#475569',
      borderColor: '#e2e8f0',
      rowHoverBg: '#f8fafc'
    },
    Tag: {
      borderRadiusSM: 6
    }
  }
}
