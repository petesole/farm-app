// Legacy Control Panel route. The active Control Panel is app/(tabs)/control-panel.tsx.
// Keep this route as a redirect so old links cannot open outdated controls.
import { Redirect } from "expo-router";

export default function LegacyControlPanelRedirect() {
  return <Redirect href="/(tabs)/control-panel" />;
}
