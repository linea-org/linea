import type { ConfigContext, ExpoConfig } from "expo/config"

export default function defineApp({ config }: ConfigContext): ExpoConfig {
  const appURL = process.env.EXPO_PUBLIC_APP_URL
  let appHost: string | undefined
  if (appURL) {
    const parsed = new URL(appURL)
    if (parsed.protocol === "https:") appHost = parsed.hostname
  }
  if (process.env.EAS_BUILD && !appHost) {
    throw new Error("EXPO_PUBLIC_APP_URL must be an HTTPS URL for EAS builds")
  }
  return {
    ...config,
    name: "Linea",
    slug: "linea-mobile",
    version: "0.0.1",
    scheme: "linea",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "app.getlinea.mobile",
      ...(appHost ? { associatedDomains: [`applinks:${appHost}`] } : {}),
    },
    android: {
      package: "app.getlinea.mobile",
      predictiveBackGestureEnabled: false,
      ...(appHost
        ? {
            intentFilters: [
              {
                action: "VIEW",
                autoVerify: true,
                data: [
                  {
                    scheme: "https",
                    host: appHost,
                    pathPrefix: "/magic-link",
                  },
                ],
                category: ["BROWSABLE", "DEFAULT"],
              },
            ],
          }
        : {}),
    },
    plugins: ["expo-router", "expo-secure-store", "expo-notifications"],
    experiments: { typedRoutes: true },
  }
}
