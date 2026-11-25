export type GhostWire = { key: string; name: string; time: number; carried: number; track: string };

export type Stats = { flyers: number; landed: number; best: number; bestBy: string | null };

export type FlightRecord = { time: number; tries: number; stars: number };

export type Leader = { name: string; time: number };

export type Carrier = { name: string; carried: number };

export type Me = { best: FlightRecord | null; tries: number; streak: number; rank: number | null; carried: number };

export type InitResponse = {
  day: number;
  today: number;
  par: number;
  wave: number;
  ghosts: GhostWire[];
  me: Me;
  stats: Stats;
  leaders: Leader[];
  carriers: Carrier[];
  user: string | null;
  offline: boolean;
};

export type SplashResponse = {
  day: number;
  par: number;
  ghosts: GhostWire[];
  stats: Stats;
  carriers: Carrier[];
  me: { best: FlightRecord | null; carried: number };
};

export type RideCredit = { name: string; secs: number };

export type FlightResponse =
  | {
      ok: true;
      arrived: boolean;
      time: number;
      progress: number;
      stars: number;
      best: FlightRecord | null;
      improved: boolean;
      rank: number | null;
      total: number;
      streak: number;
      rodeWith: RideCredit[];
      wildSecs: number;
      carried: number;
    }
  | { ok: false; message: string };

export type MessageResponse = { ok: boolean; message: string };

export const emptyStats = (): Stats => ({ flyers: 0, landed: 0, best: 0, bestBy: null });

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
