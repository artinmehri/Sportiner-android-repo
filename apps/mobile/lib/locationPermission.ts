export type ForegroundPermission = {
  status: string;
};

type GetForegroundPermission = () => Promise<ForegroundPermission>;
type RequestForegroundPermission = () => Promise<ForegroundPermission>;

export async function resolveForegroundLocationPermission(
  getForegroundPermission: GetForegroundPermission,
  requestForegroundPermission: RequestForegroundPermission,
): Promise<ForegroundPermission> {
  const existingPermission = await getForegroundPermission();

  if (existingPermission.status !== 'undetermined') {
    return existingPermission;
  }

  return requestForegroundPermission();
}
