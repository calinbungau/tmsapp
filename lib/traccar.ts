// Traccar API Integration
// API docs: https://www.traccar.org/api-reference/

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: string;
  disabled: boolean;
  lastUpdate: string | null;
  positionId: number;
  groupId: number;
  phone: string | null;
  model: string | null;
  contact: string | null;
  category: string | null;
  geofenceIds?: number[];
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  protocol: string;
  deviceTime: string;
  fixTime: string;
  serverTime: string;
  outdated: boolean;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  address: string | null;
  accuracy: number;
  network: Record<string, unknown> | null;
  attributes: {
    totalDistance?: number; // in meters
    hours?: number; // engine hours in milliseconds
    fuel?: number;
    ignition?: boolean;
    motion?: boolean;
    battery?: number;
    power?: number;
    [key: string]: unknown;
  };
}

export interface TraccarCredentials {
  serverUrl: string;
  email: string;
  password: string;
}

async function getAuthHeader(credentials: TraccarCredentials): Promise<string> {
  const auth = Buffer.from(`${credentials.email}:${credentials.password}`).toString("base64");
  return `Basic ${auth}`;
}

export async function getTraccarDevices(credentials: TraccarCredentials): Promise<TraccarDevice[]> {
  const authHeader = await getAuthHeader(credentials);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${credentials.serverUrl}/api/devices`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getTraccarPositions(
  credentials: TraccarCredentials,
  deviceId?: number
): Promise<TraccarPosition[]> {
  const authHeader = await getAuthHeader(credentials);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let url = `${credentials.serverUrl}/api/positions`;
    if (deviceId) {
      url += `?deviceId=${deviceId}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch positions: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDevicePosition(
  credentials: TraccarCredentials,
  deviceId: number
): Promise<TraccarPosition | null> {
  const positions = await getTraccarPositions(credentials, deviceId);
  return positions.find((p) => p.deviceId === deviceId) || null;
}

// Helper to convert totalDistance from meters to km
export function metersToKm(meters: number): number {
  return Math.round(meters / 1000);
}

// Helper to convert engine hours from milliseconds to hours
export function msToHours(ms: number): number {
  return Math.round(ms / (1000 * 60 * 60));
}
