<template>
  <div class="notify-panel">
    <div v-if="entries.length === 0" class="empty">暂无通知</div>
    <div v-else class="list custom-scrollbar">
      <div v-for="e in entries" :key="e.id" class="row" :class="e.level">
        <div class="meta">
          <span class="level">{{ levelText(e.level) }}</span>
          <span class="time">{{ formatTime(e.ts) }}</span>
        </div>
        <div class="msg">{{ e.message }}</div>
        <div v-if="e.payload !== undefined" class="payload-wrap">
          <JsonView :data="e.payload" :is-error="e.level === 'error'" :with-border="false" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import JsonView from './JsonView.vue';

export type NotifyLevel = 'info' | 'warn' | 'error';

export interface NotifyEntry {
  id: string;
  ts: number;
  level: NotifyLevel;
  message: string;
  payload?: any;
}

defineProps<{
  entries: NotifyEntry[];
}>();

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
};

const levelText = (level: NotifyLevel) => {
  if (level === 'error') return '错误';
  if (level === 'warn') return '警告';
  return '信息';
};

</script>

<style scoped>
.notify-panel {
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

.row {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.row.info {
  border-left: 4px solid #3b82f6;
}

.row.warn {
  border-left: 4px solid #f59e0b;
}

.row.error {
  border-left: 4px solid #ef4444;
}

.meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
}

.level {
  font-weight: 800;
  font-size: 0.8rem;
  color: #0f172a;
}

.time {
  font-size: 0.75rem;
  color: #94a3b8;
}

.msg {
  font-size: 0.9rem;
  color: #334155;
  line-height: 1.5;
}

.payload-wrap {
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fafafa;
  max-height: 280px;
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
</style>
