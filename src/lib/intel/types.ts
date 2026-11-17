/** Provider-independent normalised message — every connector (Gmail, demo, future Outlook) produces this. */
export type NormalizedMessage = {
  providerMessageId: string;
  providerThreadId: string;
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  /** Plain text body with quoted reply history stripped. Untrusted content. */
  bodyText: string;
  snippet: string;
  labels: string[];
  /** Lower-cased subset of headers relevant to filtering. */
  headers: Record<string, string>;
};

export type FilterCategory = "candidate" | "newsletter" | "notification" | "spam" | "auto_reply";

export type SignalType =
  | "enquiry"
  | "pricing_question"
  | "quote_request"
  | "consultation_request"
  | "info_request"
  | "proposal_sent"
  | "invoice_sent"
  | "payment_request"
  | "payment_promise"
  | "payment_confirmation"
  | "acceptance"
  | "rejection"
  | "closing"
  | "callback_promise"
  | "renewal"
  | "question"
  | "thanks_only"
  | "business_context"
  | "injection_suspected";

export type Signal = { type: SignalType; match: string; weight: number };

export type MoneyMention = { amountCents: number; currency: string; raw: string; index: number; isTotal: boolean };
export type DateMention = { date: Date; raw: string; confidence: number; kind: "explicit" | "relative" };

export type FinancialKind = "quote" | "proposal" | "invoice" | "payment_promise" | "payment_confirmation" | "price_mention";

export type FinancialRecord = {
  kind: FinancialKind;
  providerMessageId: string;
  amountCents: number | null;
  currency: string | null;
  rawText: string;
  dueDate: Date | null;
  reference: string | null;
  confidence: number;
};

export type MessageAnalysis = {
  providerMessageId: string;
  direction: "inbound" | "outbound";
  filter: FilterCategory;
  signals: Signal[];
  amounts: MoneyMention[];
  dates: DateMention[];
  questions: string[];
  invoiceRef: string | null;
};

export type Stage = "new" | "contacted" | "proposal_sent" | "negotiating" | "won" | "lost" | "invoiced" | "paid" | "dormant";

export type OpportunityCategory = "unanswered_lead" | "proposal_awaiting" | "payment_followup" | "client_followup";

export type Evidence = { providerMessageId: string; kind: string; excerpt: string; detail?: Record<string, unknown> };

export type OpportunityCandidate = {
  category: OpportunityCategory;
  reason: string;
  title: string;
  summary: string;
  stage: Stage;
  amountCents: number | null;
  currency: string | null;
  amountMethod: string | null;
  confidence: number;
  lastInteractionAt: Date;
  dueDate: Date | null;
  recommendedAction: string;
  evidence: Evidence[];
  assumptions: string[];
};

export type ThreadClassification = "commercial" | "newsletter" | "notification" | "spam" | "auto_reply" | "other";
export type ConversationStatus = "awaiting_business" | "awaiting_contact" | "closed" | "no_action";

export type DetectionSettings = {
  leadResponseHours: number;
  proposalInactivityDays: number;
  paymentGraceDays: number;
  followUpDays: number;
  callbackDays: number;
  dormantDays: number;
  assumedPaymentTermsDays: number;
};

export const DEFAULT_SETTINGS: DetectionSettings = {
  leadResponseHours: 4,
  proposalInactivityDays: 3,
  paymentGraceDays: 3,
  followUpDays: 2,
  callbackDays: 2,
  dormantDays: 60,
  assumedPaymentTermsDays: 30,
};

export type ThreadAnalysis = {
  classification: ThreadClassification;
  status: ConversationStatus;
  stage: Stage;
  contact: { email: string; name: string | null } | null;
  messages: MessageAnalysis[];
  financials: FinancialRecord[];
  candidates: OpportunityCandidate[];
  ambiguous: boolean;
  injectionSuspected: boolean;
  lastMessageAt: Date | null;
  notes: string[];
};
