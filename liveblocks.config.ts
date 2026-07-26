import type { LiveMap, LiveObject } from "@liveblocks/client"
import type { LiveblocksNode, LiveblocksEdge } from "@liveblocks/react-flow"
import type { CanvasNode, CanvasEdge } from "@/types/canvas"

declare global {
  interface Liveblocks {
    Presence: {
      cursor: { x: number; y: number } | null;
      thinking: boolean;
    };

    Storage: {
      flow: LiveObject<{
        nodes: LiveMap<string, LiveblocksNode<CanvasNode>>;
        edges: LiveMap<string, LiveblocksEdge<CanvasEdge>>;
      }>;
    };

    UserMeta: {
      id: string;
      info: {
        name: string;
        avatar: string;
        color: string;
      };
    };

    RoomEvent:
      | { type: "ai-status"; message: string; status: "start" | "thinking" | "complete" | "error" }
      | { type: "run.started"; projectId: string; runId: string; timestamp: string; sequence: number; phase: string; stepId?: string }
      | { type: "run.status_changed"; projectId: string; runId: string; timestamp: string; sequence: number; status: string }
      | { type: "run.step_changed"; projectId: string; runId: string; timestamp: string; sequence: number; phase: string; stepId: string }
      | { type: "run.waiting_clarification"; projectId: string; runId: string; timestamp: string; sequence: number }
      | { type: "run.resumed"; projectId: string; runId: string; timestamp: string; sequence: number }
      | { type: "run.completed"; projectId: string; runId: string; timestamp: string; sequence: number }
      | { type: "run.failed"; projectId: string; runId: string; timestamp: string; sequence: number }
      | { type: "memory.section_updated"; projectId: string; runId: string; timestamp: string; sequence: number; section: string; sectionStatus: string; agentId?: string }
      | { type: "memory.section_status_changed"; projectId: string; runId: string; timestamp: string; sequence: number; section: string; sectionStatus: string }
      | { type: "clarification.updated"; projectId: string; runId: string; timestamp: string; sequence: number };

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    ThreadMetadata: {};

    FeedMessageData: {
      // ai-status-feed
      text?: string;
      status?: "start" | "thinking" | "complete" | "error";
      // ai-chat feed
      sender?: string;
      role?: "user" | "assistant";
      content?: string;
      timestamp?: string;
    };

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    RoomInfo: {};
  }
}

export {};
