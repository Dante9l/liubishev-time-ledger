export type EntrySource = "manual" | "timer";
export type StatsPeriod = "day" | "week" | "month";
export type TimeInputStyle = "range_compact" | "range_clock" | "duration_minutes" | "duration_hm";

export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  enabled: boolean;
  isProductive: boolean;
}

export interface AISettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  includeNotes: boolean;
  timeoutMs: number;
}

export interface DailyNoteSettings {
  enabled: boolean;
  folder: string;
  filenameFormat: string;
  heading: string;
  blockId: string;
}

export interface SmartCategorySettings {
  enabled: boolean;
  autoApplyHighConfidence: boolean;
  enableAISuggestions: boolean;
  applyAISuggestedTags: boolean;
}

export interface PluginSettings {
  categories: Category[];
  maxRecentCategories: number;
  autoFillFromLastEntry: boolean;
  defaultRangeMinutes: number;
  exportFolder: string;
  recentCategoryIds: string[];
  dailyNote: DailyNoteSettings;
  smartCategory: SmartCategorySettings;
  ai: AISettings;
}

export interface TimeEntry {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  timeInputStyle?: TimeInputStyle;
  categoryId: string;
  tags: string[];
  project: string;
  note: string;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
}

export interface TimeLedgerData {
  version: number;
  entries: TimeEntry[];
  settings: PluginSettings;
}

export interface EntryDraft {
  id?: string;
  date: string;
  timeInput: string;
  categoryId: string;
  tags: string[];
  project: string;
  note: string;
  source: EntrySource;
}

export interface EntryFormSeed {
  id?: string;
  date?: string;
  timeInput?: string;
  categoryId?: string;
  tags?: string[];
  project?: string;
  note?: string;
  source?: EntrySource;
}

export interface SuggestedEntryDraft {
  date: string;
  timeInput: string;
  categoryId: string;
}

export interface TimeParseResult {
  mode: "range" | "duration";
  normalizedInput: string;
  description: string;
  durationMinutes: number;
  startTime?: string;
  endTime?: string;
}

export interface GapSegment {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  color: string;
  totalMinutes: number;
  entryCount: number;
  productiveMinutes: number;
}

export interface TagSummary {
  tag: string;
  totalMinutes: number;
  entryCount: number;
}

export interface PeriodSummary {
  period: StatsPeriod;
  label: string;
  startDate: string;
  endDate: string;
  totalMinutes: number;
  productiveMinutes: number;
  entryCount: number;
  categorySummaries: CategorySummary[];
  tagSummaries: TagSummary[];
  gaps: GapSegment[];
  entries: TimeEntry[];
}

export interface ExportArtifact {
  fileName: string;
  title: string;
  content: string;
}

export interface CategorySuggestion {
  categoryId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  source: "local" | "ai";
  tags: string[];
}
