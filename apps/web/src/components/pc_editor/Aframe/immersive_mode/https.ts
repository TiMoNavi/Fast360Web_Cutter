export function isHttpsLocation(location: Location) {
  return location.protocol === "https:";
}

export function httpsRequirementMessage(isHttps: boolean) {
  return isHttps ? "HTTPS ready for Meta immersive mode." : "HTTPS is required before entering Meta VR.";
}
