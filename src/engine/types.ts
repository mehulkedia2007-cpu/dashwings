export type TrainClass = '1A' | '2A' | '3A' | 'SL';
export type PnrStatus = 'WL' | 'RAC' | 'CNF';

export interface TrainBooking {
  pnr: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  departure: string; // ISO
  trainClass: TrainClass;
  bookedAt: string; // ISO
  passengers: { name: string; statusAtBooking: string; currentStatus: string }[];
  confirmChanceAtBooking: number; // 0..1
  confirmChanceNow: number; // 0..1
  finalOutcome: PnrStatus[]; // hidden until chart; one per passenger
}

export interface Flight {
  id: string;
  flightNo: string;
  fromAirport: string;
  toAirport: string;
  departure: string;
  arrival: string;
  capacity: number;
  sold: number;
  publicFare: number;
  cabinBagKg: number;
  checkInBagKg: number;
}

export interface ReleaseRule {
  flightId: string;
  mode: 'auto' | 'approve';
  maxLoadFactorToRelease: number;
  maxSeats: number;
  floorPrice: number; // all-inclusive, per seat
  blackout: boolean;
}

export interface StationAirport {
  station: string;
  airport: string;
  distanceKm: number;
  travelMinutes: number;
}

export type PaymentMode = 'fullBlock' | 'deposit';

export type OrderStatus =
  | 'active'
  | 'cancelled'
  | 'trainConfirmed'
  | 'inMarket'
  | 'won'
  | 'notWon'
  | 'ineligible';

export interface IfThenOrder {
  id: string;
  pnr: string;
  travellers: { nameOnId: string }[];
  maxPricePerSeat: number; // all-inclusive
  acceptableWindow: { earliest: string; latest: string };
  racCountsAsFailed: boolean;
  groupTrigger: 'anyLeftOut' | 'allLeftOut';
  payment: PaymentMode;
  placedAt: string;
  status: OrderStatus;
  result?: { flightId: string; pricePerSeat: number };
}

export interface MarketRun {
  id: string;
  flightId: string;
  ranAt: string;
  seatsReleased: number;
  floorPrice: number;
  clearingPrice: number | null;
  winners: string[]; // order ids
  seatsSold: number;
  revenue: number;
  commission: number;
}
