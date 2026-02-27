# Tool UI Research

> **Library**: [tool-ui](https://www.tool-ui.com/) by [assistant-ui](https://www.assistant-ui.com/)
> **GitHub**: [assistant-ui/tool-ui](https://github.com/assistant-ui/tool-ui) — 534 stars, MIT License
> **Install**: `npx shadcn@latest add https://tool-ui.com/r/{component}.json`

---

## What It Is

Tool UI is a **copy/paste component library** (like shadcn/ui) made by the same team behind assistant-ui. Its sole purpose is solving one specific problem: when an AI assistant calls a tool, the result comes back as JSON — and most apps just dump that raw JSON into the chat. Tool UI provides pre-built React components that render that JSON as proper UI inline in the conversation.

It doesn't replace your design system — it extends it. Components use **shadcn primitives** internally and follow your theme. Built on **React + Zod + Tailwind CSS**.

---

## How It Works (The Pipeline)

The flow is **schema-first**:

1. **Assistant calls a tool** → e.g. `previewLink({ url: "..." })`
2. **Tool executes on server** → returns structured JSON matching a defined schema
3. **Client-side renderer** parses the JSON with `safeParse` against the component's Zod schema
4. **If it matches** → the component renders inline in the chat message
5. **If interactive** → the user's choice feeds back to the assistant via `addResult()`

Each component ships with a colocated `schema.ts` that exports a Zod schema and a `safeParseSerializable{ComponentName}` function. This means the data contract between server and client is **typed and validated** — no brittle string parsing.

```
// The tool returns structured JSON...
{ id: "lp-1", href: "https://tailwindcss.com/docs", title: "Tailwind CSS", description: "Rapidly build modern websites..." }
// ...that matches the LinkPreview schema → renders as a card
```

---

## Component Categories

### Display / Artifacts
- **Data Table** — sortable tables with row actions
- **Chart** — data visualization
- **Citation** — source references
- **Link Preview** — rich URL cards (favicon, title, description)
- **Stats Display** — key metrics/numbers
- **Code Block** — syntax-highlighted code
- **Code Diff** — side-by-side or unified diffs
- **Terminal** — command output display

### Media / Creative
- **Image** — single image display
- **Image Gallery** — multi-image grid
- **Video** — video player
- **Audio** — audio player
- **Instagram Post** — social post mockup
- **LinkedIn Post** — social post mockup
- **X Post** — social post mockup
- **Message Draft** — email/message preview

### Input / Decision (Interactive)
- **Option List** — user picks from choices, selection feeds back to assistant
- **Parameter Slider** — adjustable numeric values
- **Preferences Panel** — multi-setting configuration
- **Question Flow** — multi-step question sequences

### Confirmation
- **Approval Card** — approve/reject actions with receipt state
- **Order Summary** — transaction confirmation

### Progress / Execution
- **Plan** — multi-step task plan display
- **Progress Tracker** — step-by-step progress visualization
- **Weather Widget** — weather data card

---

## Two Types of Components

### Display-Only
Render data and that's it. The tool returns JSON, the component shows it. Examples: Link Preview, Chart, Data Table, Code Block.

### Interactive (with Actions + Receipts)
Let users make decisions that **feed back into the conversation**. The flow:

1. Model calls a tool → component renders with options
2. User makes a choice (approve, select option, etc.)
3. Choice returns to assistant as a tool result via `addResult(...)`
4. Component transitions to a **receipt state** — a permanent record of what was chosen
5. Assistant can reference the receipt in future messages

Examples: Option List, Approval Card, Order Summary.

**Receipt state** is important — it gives the user proof of what happened and gives the assistant something to reference later ("you approved the refund above").

---

## The Design Philosophy: Collaborative Triad

Tool UI introduces a design model where three entities collaborate:

```
User ←→ Tool UI ←→ Assistant
  controls    mediates    narrates
```

- The **assistant** contextualizes, interprets, and narrates
- The **tool UI** provides structure that prose cannot: sortable tables, precise controls, rich media
- They work **together** — the assistant introduces the tool UI, the user interacts, then asks follow-ups referencing specific data

### Component Roles
Every Tool UI has a primary role:
- **Information**: Display data (tables, cards, charts). Users read more than they click.
- **Decision**: Capture choices that matter (approve/reject, send/cancel). Need clear options and receipts.
- **Control**: Adjust parameters without commitment (filters, sort orders). Changes are reversible.
- **State**: Show internal activity (progress indicators, status logs, loading states).

### Layout Constraints (Chat Context)
- **Vertical**: Communicate purpose within ~300px height
- **Horizontal**: Expect 400–600px width, prefer single-column layouts
- **Touch**: Interactive elements need at least 44×44px tap area
- **Choices**: Limit visible options to 5–7. Assistant can offer to show more.

### Addressability
If the assistant can't point at something later, you lose half the value:
- Every tool UI needs an `id` so the assistant can reference it ("the table above")
- Use stable IDs from your backend (database IDs, canonical URLs) rather than array indexes
- Anything the user can act on should have an ID the assistant can cite

### Anti-Patterns to Avoid
- **Input fields**: They compete with the main chat composer. Use conversation or external forms instead.
- **Hidden mutations**: Actions that change state should show what happened (use receipts).
- **Kitchen sinks**: If it needs tabs or navigation, break it into separate tool UIs.
- **Uncontextualized tool UIs**: Always have the assistant introduce and explain what it shows.
- **Redundant narration**: Don't have both the assistant AND the tool UI say the same thing. Divide the work: assistant provides context, tool UI provides structure.

---

## Integration with assistant-ui

Tool UI is **designed to plug into assistant-ui's runtime**. The full wiring looks like:

### 1. Install a component
```bash
npx shadcn@latest add https://tool-ui.com/r/link-preview.json
```
This copies source files into `components/tool-ui/link-preview/` in your project.

### 2. Define a backend tool (API route)
```typescript
import { streamText, tool, convertToModelMessages, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4o"),
    messages: await convertToModelMessages(messages),
    tools: {
      previewLink: tool({
        description: "Show a preview card for a URL",
        inputSchema: jsonSchema<{ url: string }>({
          type: "object",
          properties: { url: { type: "string", format: "uri" } },
          required: ["url"],
          additionalProperties: false,
        }),
        async execute({ url }) {
          return {
            id: "link-preview-1",
            href: url,
            title: "Example Site",
            description: "A description of the linked content",
            image: "https://example.com/image.jpg",
          };
        },
      }),
    },
  });
  return result.toUIMessageStreamResponse();
}
```

### 3. Register a renderer (frontend)
```tsx
"use client";
import {
  AssistantRuntimeProvider,
  Tools,
  useAui,
  type Toolkit,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { LinkPreview } from "@/components/tool-ui/link-preview";
import { safeParseSerializableLinkPreview } from "@/components/tool-ui/link-preview/schema";

const toolkit: Toolkit = {
  previewLink: {
    type: "backend",
    render: ({ result }) => {
      const parsed = safeParseSerializableLinkPreview(result);
      if (!parsed) return null;
      return <LinkPreview {...parsed} />;
    },
  },
};

export default function Page() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });
  const aui = useAui({ tools: Tools({ toolkit }) });

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      {/* Your chat thread component */}
    </AssistantRuntimeProvider>
  );
}
```

### Interactive Frontend Tool Example (Option List)
```tsx
"use client";
import { makeAssistantTool } from "@assistant-ui/react";
import {
  OptionList,
  parseSerializableOptionList,
  SerializableOptionListSchema,
  type SerializableOptionList,
  type OptionListSelection,
} from "@/components/tool-ui/option-list";

export const SelectFormatTool = makeAssistantTool<
  SerializableOptionList,
  OptionListSelection
>({
  toolName: "selectFormat",
  description: "Ask the user to choose an output format.",
  parameters: SerializableOptionListSchema,
  render: ({ args, result, addResult, toolCallId }) => {
    if (!Array.isArray((args as any)?.options)) return null;

    const optionList = parseSerializableOptionList({
      ...args,
      id: (args as any)?.id ?? `format-selection-${toolCallId}`,
    });

    // Receipt state (after selection)
    if (result !== undefined) {
      return <OptionList {...optionList} value={undefined} choice={result} />;
    }

    // Active state (waiting for selection)
    return (
      <OptionList
        {...optionList}
        onSubmit={(selection) => addResult(selection)}
      />
    );
  },
});
```

---

## Can You Use It Without assistant-ui?

**Yes, but with caveats.**

The docs say: *"Tool UI components work with any React app. Without assistant-ui, you manually parse tool outputs and render components. Use assistant-ui for the best experience."*

Since it's a copy/paste library (like shadcn), you're copying the source code into your project. The components are just React + Zod schemas. You **can** use them standalone by passing props manually.

**What you lose without assistant-ui:**
- Automatic schema-matching and tool name routing
- The `addResult()` callback flow for interactive components
- Receipt state management
- `useAui` and `Tools()` integration hooks
- Streaming-aware rendering (loading states during tool execution)

**What you keep:**
- All the visual components (they're just React)
- Zod schemas for validation
- shadcn/ui styling that follows your theme

---

## Supported Runtimes

assistant-ui (and by extension Tool UI) supports multiple backends:
- **Vercel AI SDK** (primary, best supported)
- **LangGraph** (official integration)
- **Mastra**
- **LangServe**
- **Custom backends**

---

## Relevance to Movesia

### Components That Map Well to Movesia's Use Cases
| Movesia Feature | Tool UI Component |
|---|---|
| File operation approvals | **Approval Card** |
| Agent task plans | **Plan** |
| Task execution progress | **Progress Tracker** |
| Code generation results | **Code Block**, **Code Diff** |
| Unity console output | **Terminal** |
| Web search results | **Link Preview**, **Citation** |
| Agent decisions/choices | **Option List** |
| Build/compile stats | **Stats Display** |
| Asset previews | **Image**, **Image Gallery** |

### Two Paths Forward

**Path 1: Cherry-pick components (minimal change)**
- Install individual Tool UI components
- Strip out assistant-ui wiring
- Use as regular React components in current custom chat UI
- Feed props manually from LangGraph agent's tool call responses
- Lose automatic routing but get the visual components

**Path 2: Adopt assistant-ui as chat runtime (bigger migration)**
- assistant-ui has a LangGraph integration already
- Handles streaming, tool rendering, human-in-the-loop, state management
- Tool UI plugs in seamlessly
- Tradeoff: migrating current custom chat implementation
- Gains: production-ready UX (auto-scroll, retries, attachments, markdown, code highlighting, keyboard shortcuts, accessibility)

---

## Key Links

- **Tool UI Docs**: https://www.tool-ui.com/docs/overview
- **Quick Start**: https://www.tool-ui.com/docs/quick-start
- **Design Guidelines**: https://www.tool-ui.com/docs/design-guidelines
- **Component Gallery**: https://www.tool-ui.com/docs/gallery
- **assistant-ui Docs**: https://www.assistant-ui.com/docs
- **assistant-ui GitHub**: https://github.com/assistant-ui/assistant-ui (8.6k stars)
- **Tool UI GitHub**: https://github.com/assistant-ui/tool-ui (534 stars)
- **LangGraph Integration**: https://www.assistant-ui.com/docs (search for LangGraph runtime)
