export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const x = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat))
    * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function heatCell(latitude: number, longitude: number) {
  const lat = Math.round(latitude * 100) / 100;
  const lng = Math.round(longitude * 100) / 100;
  return {
    gridKey: `${lat.toFixed(2)}:${lng.toFixed(2)}`,
    latitude: lat,
    longitude: lng,
  };
}
