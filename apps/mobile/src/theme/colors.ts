import { PlatformColor } from "react-native"

export const colors = {
  accent: PlatformColor("systemBlue", "?attr/colorAccent"),
  canvas: PlatformColor("systemBackground", "?attr/colorBackground"),
  danger: PlatformColor("systemRed", "?attr/colorError"),
  success: PlatformColor("systemGreen", "?attr/colorAccent"),
  warning: PlatformColor("systemOrange", "?attr/colorAccent"),
  muted: PlatformColor("secondaryLabel", "?attr/textColorSecondary"),
  separator: PlatformColor("separator", "?attr/colorControlNormal"),
  surface: PlatformColor(
    "secondarySystemBackground",
    "?attr/colorBackgroundFloating"
  ),
  text: PlatformColor("label", "?attr/textColorPrimary"),
}
