<template>
  <div class="json-view" :class="{ 'json-view-bordered': withBorder }">
    <JsonNode
      :data="normalizedData"
      :name="name"
      :depth="0"
      :initial-expand-depth="initialExpandDepth"
      :is-error="isError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineComponent, h, type PropType, type VNode } from 'vue';

/* ---- types ---- */
type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [k: string]: JsonValue };

function getDataType(value: JsonValue): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return typeof value;
}

function tryParseJson(str: string): { ok: boolean; data: JsonValue } {
  const trimmed = str?.trim();
  if (!trimmed) return { ok: false, data: str };
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}')) && !(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return { ok: false, data: str };
  }
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch {
    return { ok: false, data: str };
  }
}

/* ---- props ---- */
const props = withDefaults(defineProps<{
  data: any;
  name?: string;
  initialExpandDepth?: number;
  isError?: boolean;
  withBorder?: boolean;
}>(), {
  initialExpandDepth: 3,
  isError: false,
  withBorder: true,
});

const normalizedData = computed<JsonValue>(() => {
  if (typeof props.data === 'string') {
    const r = tryParseJson(props.data);
    return r.ok ? r.data : props.data;
  }
  return props.data as JsonValue;
});

/* ---- recursive JsonNode (render function) ---- */
const JsonNode: ReturnType<typeof defineComponent> = defineComponent({
  name: 'JsonNode',
  props: {
    data: { type: null as unknown as PropType<JsonValue>, required: true },
    name: { type: String, default: undefined },
    depth: { type: Number, default: 0 },
    initialExpandDepth: { type: Number, default: 3 },
    isError: { type: Boolean, default: false },
  },
  setup(p): () => VNode {
    const expanded = ref(p.depth < p.initialExpandDepth);
    const strExpanded = ref(false);
    const STR_MAX = 120;

    const colorOf = (type: string): string => {
      if (type === 'string') return p.isError ? '#dc2626' : '#16a34a';
      if (type === 'number') return '#2563eb';
      if (type === 'boolean') return '#d97706';
      if (type === 'null' || type === 'undefined') return '#9333ea';
      return '#4b5563';
    };

    return (): VNode => {
      const data = p.data;
      const dataType = getDataType(data);

      /* ---- key span ---- */
      const keySpan = p.name !== undefined
        ? h('span', { class: 'jv-key' }, `${p.name}: `)
        : null;

      /* ---- object / array ---- */
      if (dataType === 'object' || dataType === 'array') {
        const isArray = dataType === 'array';
        const items = isArray ? (data as JsonValue[]) : Object.entries(data as Record<string, JsonValue>);
        const count = items.length;
        const open = isArray ? '[' : '{';
        const close = isArray ? ']' : '}';

        if (count === 0) {
          return h('div', { class: 'jv-line' }, [
            keySpan,
            h('span', { class: 'jv-bracket' }, isArray ? '[]' : '{}'),
          ]);
        }

        const toggleBtn = h('span', {
          class: 'jv-toggle',
          onClick: (e: MouseEvent) => { e.stopPropagation(); expanded.value = !expanded.value; },
        }, expanded.value ? '▼' : '▶');

        if (!expanded.value) {
          return h('div', { class: 'jv-line jv-clickable', onClick: () => { expanded.value = true; } }, [
            toggleBtn,
            keySpan,
            h('span', { class: 'jv-bracket' }, `${open} ... ${close}`),
            h('span', { class: 'jv-count' }, ` ${count} items`),
          ]);
        }

        const children: VNode[] = isArray
          ? (items as JsonValue[]).map((item, i) =>
              h('div', { class: 'jv-child', key: i }, [
                h(JsonNode, { data: item, name: String(i), depth: p.depth + 1, initialExpandDepth: p.initialExpandDepth, isError: p.isError }),
              ])
            )
          : (items as [string, JsonValue][]).map(([key, val]) =>
              h('div', { class: 'jv-child', key }, [
                h(JsonNode, { data: val, name: key, depth: p.depth + 1, initialExpandDepth: p.initialExpandDepth, isError: p.isError }),
              ])
            );

        return h('div', { class: 'jv-node' }, [
          h('div', { class: 'jv-line jv-clickable', onClick: () => { expanded.value = false; } }, [
            toggleBtn,
            keySpan,
            h('span', { class: 'jv-bracket' }, open),
          ]),
          h('div', { class: 'jv-children' }, children),
          h('div', { class: 'jv-line' }, [
            h('span', { class: 'jv-bracket' }, close),
          ]),
        ]);
      }

      /* ---- string ---- */
      if (dataType === 'string') {
        const str = data as string;
        const tooLong = str.length > STR_MAX;
        const display = tooLong && !strExpanded.value ? `"${str.slice(0, STR_MAX)}..."` : `"${str}"`;

        return h('div', { class: 'jv-line' }, [
          keySpan,
          h('span', {
            class: tooLong ? 'jv-value jv-clickable' : 'jv-value',
            style: { color: colorOf('string'), whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
            onClick: tooLong ? () => { strExpanded.value = !strExpanded.value; } : undefined,
          }, display),
        ]);
      }

      /* ---- number / boolean / null ---- */
      const displayVal = data === null ? 'null' : data === undefined ? 'undefined' : String(data);
      return h('div', { class: 'jv-line' }, [
        keySpan,
        h('span', { class: 'jv-value', style: { color: colorOf(dataType) } }, displayVal),
      ]);
    };
  },
});
</script>

<style scoped>
.json-view {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  overflow: auto;
}

.json-view-bordered {
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: var(--card, #fff);
}
</style>

<style>
/* JsonNode uses render functions => must be unscoped */
.json-view .jv-line {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  min-height: 1.6em;
}

.json-view .jv-clickable {
  cursor: pointer;
  border-radius: 4px;
}

.json-view .jv-clickable:hover {
  background: rgba(0, 0, 0, 0.04);
}

.json-view .jv-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  flex-shrink: 0;
  font-size: 0.6rem;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
  margin-top: 2px;
}

.json-view .jv-key {
  color: #4b5563;
  flex-shrink: 0;
}

.json-view .jv-bracket {
  color: #6b7280;
}

.json-view .jv-count {
  color: #9ca3af;
  font-size: 0.75rem;
  margin-left: 4px;
}

.json-view .jv-value {
  word-break: break-word;
}

.json-view .jv-children {
  padding-left: 20px;
  border-left: 1px solid #e5e7eb;
  margin-left: 7px;
}

.json-view .jv-child {
  margin: 1px 0;
}

.json-view .jv-node {
  display: flex;
  flex-direction: column;
}
</style>
