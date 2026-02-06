<template>
  <div class="history-panel">
    <div v-if="entries.length === 0" class="empty">
      暂无历史记录
    </div>
    <div v-else class="list custom-scrollbar">
      <details v-for="item in entries" :key="item.id" class="entry" @toggle="handleToggle(item, $event)">
        <summary class="entry-summary">
          <div class="left">
            <span class="seq">#{{ item.seq }}</span>
            <span class="method">{{ item.method }}</span>
            <span v-if="item.title" class="title">· {{ item.title }}</span>
          </div>
          <div class="right">
            <span v-if="typeof item.duration_ms === 'number'" class="pill time">{{ item.duration_ms }}ms</span>
            <span class="pill" :class="item.status">{{ item.status === 'success' ? '成功' : '失败' }}</span>
            <span class="ts">{{ formatTime(item.ts) }}</span>
          </div>
        </summary>

        <div class="entry-body">
          <div class="section">
            <div class="section-header">
              <span class="section-title">请求</span>
              <button type="button" class="icon-btn" title="复制请求" @click.prevent="copyJson(item.request)">
                复制
              </button>
            </div>
            <pre class="code">{{ formatJson(item.request) }}</pre>
          </div>

          <div class="section">
            <div class="section-header">
              <span class="section-title">响应</span>
              <div class="actions">
                <button type="button" class="icon-btn" title="回放到右侧" @click.prevent="emit('select', item)">
                  回放
                </button>
                <button type="button" class="icon-btn" title="复制响应" @click.prevent="copyJson(item.response)">
                  复制
                </button>
              </div>
            </div>
            <pre class="code">{{ formatJson(item.response) }}</pre>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type HistoryStatus = 'success' | 'error';

export interface HistoryEntry {
  id: string;
  seq: number;
  ts: number;
  method: string;
  title?: string;
  status: HistoryStatus;
  duration_ms?: number;
  request: any;
  response: any;
}

const props = defineProps<{
  entries: HistoryEntry[];
}>();

const emit = defineEmits<{
  (e: 'select', entry: HistoryEntry): void;
  (e: 'expanded', entry: HistoryEntry): void;
}>();

const safeEntries = computed(() => props.entries || []);

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
};

const formatJson = (value: any) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const copyJson = async (value: any) => {
  try {
    await navigator.clipboard.writeText(formatJson(value));
  } catch {
    // ignore
  }
};

const handleToggle = (item: HistoryEntry, evt: Event) => {
  const el = evt.target as HTMLDetailsElement | null;
  if (el?.open) emit('expanded', item);
};
</script>

<style scoped>
.history-panel {
  height: 100%;
  min-height: 0;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 0.9rem;
}

.list {
  height: 100%;
  overflow: auto;
  padding: 8px;
}

.entry {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  margin-bottom: 8px;
  overflow: hidden;
}

.entry-summary {
  list-style: none;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.entry-summary::-webkit-details-marker {
  display: none;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.seq {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.85rem;
}

.method {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.85rem;
  color: #334155;
}

.title {
  color: #64748b;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.pill.success {
  background: #dcfce7;
  color: #15803d;
}

.pill.error {
  background: #fee2e2;
  color: #b91c1c;
}

.pill.time {
  background: #eff6ff;
  color: #1d4ed8;
}

.ts {
  color: #94a3b8;
  font-size: 0.75rem;
}

.entry-body {
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.section {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.section-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: #334155;
}

.actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.8rem;
  cursor: pointer;
}

.icon-btn:hover {
  background: #f1f5f9;
}

.code {
  margin: 0;
  padding: 10px;
  background: #0b1220;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

@media (max-width: 1100px) {
  .entry-body {
    grid-template-columns: 1fr;
  }
}
</style>
