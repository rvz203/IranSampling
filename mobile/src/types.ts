export type User = {
  id: string;
  name: string;
  username?: string;
  role: "sampler" | "supervisor";
};

export type Identity = {
  origin: string;
  token: string;
  expiresAt: string;
  user: User;
};
export const accountKey = (auth: Identity) => `${auth.origin}|${auth.user.id}`;

export type Shift = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  brand_name: string;
  location_name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  starts_at: string;
  ends_at: string;
  status: "active" | "scheduled" | "completed";
  supervisor_id: string;
  supervisor_name: string;
  instructions: string;
  ready: boolean;
  target: number;
  received: number;
  distributed: number;
  remaining: number;
  team: { id: string; name: string }[];
};

export type Attendance = {
  id: string;
  shift_id: string;
  person_id: string;
  person_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
};
export type Priority = "low" | "medium" | "high" | "urgent";
export type Issue = {
  id: string;
  shift_id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  priority: Priority;
  owner_name: string;
};
export type Report = {
  id: string;
  shift_id: string;
  status: "pending" | "returned" | "approved";
  summary: string;
  feedback: string;
  submitted_name: string;
};
export type Photo = {
  id: string;
  shift_id: string;
  caption: string;
  original_name: string;
  person_name: string;
};
export type Workspace = {
  user: User;
  server_time: string;
  map_available?: boolean;
  campaigns?: Campaign[];
  shifts: Shift[];
  attendance: Attendance[];
  issues: Issue[];
  reports: Report[];
  evidence: Photo[];
};

export type Campaign = {
  id: string;
  name: string;
  brand_name: string;
  status: "draft" | "scheduled" | "active" | "paused" | "completed";
  start_date: string;
  end_date: string;
};

export type CampaignMessage = {
  id: number;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
};

export type CampaignEvent = {
  id: string;
  detail: string;
  actor_name: string;
  location_name: string;
  created_at: string;
};

export type GeoFix = { latitude: number; longitude: number; accuracy: number };
export type Sample = GeoFix & { captured_at: string };
export type TrackingSession = {
  id: string;
  shift_id: string;
  started_at: string;
  expires_at: string;
  server_time: string;
};
export type TrackingState = TrackingSession & {
  clockOffset: number;
  background: boolean;
  lastBucket: number | null;
};
export type LivePoint = {
  person_id: string;
  person_name: string;
  role: User["role"];
  shift_id: string;
  location_name: string;
  captured_at: string | null;
  received_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
};

export type OutboxPayload =
  | { kind: "fix"; trackingId: string; sample: Sample }
  | { kind: "stop"; trackingId: string; stoppedAt: string }
  | { kind: "photo"; uri: string; caption: string };
export type OutboxItem = {
  id: string;
  shiftId: string;
  payload: OutboxPayload;
  createdAt: number;
  attempts: number;
  error: string | null;
  rejected: boolean;
};
