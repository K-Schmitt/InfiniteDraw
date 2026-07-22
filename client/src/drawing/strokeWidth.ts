/** Local width stored in the anchor frame = on-screen px ÷ the scale it was drawn at. */
export function toLocalWidth(screenWidth: number, cameraScaleAtGesture: number): number {
  return screenWidth / cameraScaleAtGesture;
}

/** On-screen width now = stored local width × the current camera scale. */
export function toScreenWidth(localWidth: number, cameraScaleNow: number): number {
  return localWidth * cameraScaleNow;
}
