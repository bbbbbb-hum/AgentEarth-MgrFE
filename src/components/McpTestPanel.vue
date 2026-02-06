<template>
  <div class="mcp-test-panel" :class="{ 'focus-mode': focusMode }">
    <div class="panel-header">
      <div class="header-left">
        <div class="icon-wrapper">
          <span class="header-icon">🔌</span>
        </div>
        <div class="header-info">
          <h2>MCP 服务测试台</h2>
          <div class="header-meta">
            <span class="service-name">{{ serviceName }}</span>
            <div class="connection-badge" :class="connectionStatus">
              <span class="status-dot"></span>
              <span class="status-text">{{ statusText }}</span>
            </div>
          </div>
        </div>
      </div>
      <button class="btn-close" @click="$emit('close')" title="关闭">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <div class="main-content">
      <div class="sidebar">
        <div class="card">
          <div class="card-title-row">
            <span class="card-title">连接</span>
            <span class="pill" :class="connectionStatus">{{ statusText }}</span>
          </div>
          <div class="kv">
            <span class="k">configId</span>
            <span class="v">{{ configId }}</span>
          </div>
          <div class="kv" v-if="connectResult?.server_info">
            <span class="k">Server</span>
            <span class="v">{{ connectResult.server_info.name }} v{{ connectResult.server_info.version }}</span>
          </div>
          <div class="err" v-if="connectionError">{{ connectionError }}</div>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="connecting" @click="connect">
              {{ connecting ? '连接中...' : (connectionStatus === 'connected' ? '重连' : '连接') }}
            </button>
            <button class="btn btn-light" :disabled="connecting && connectionStatus !== 'connected'" @click="disconnect">
              断开
            </button>
          </div>
        </div>

        <div class="card tools-card">
          <div class="card-title-row">
            <span class="card-title">工具</span>
            <span class="count">{{ filteredTools.length }}</span>
          </div>
          <div class="search">
            <input v-model="toolQuery" class="search-input" type="text" placeholder="搜索工具..." />
          </div>
          <div class="tools-list custom-scrollbar">
            <div
              v-for="tool in filteredTools"
              :key="tool.name"
              class="tool-item"
              role="button"
              tabindex="0"
              :class="{ active: selectedTool?.name === tool.name }"
              @click.prevent.stop="selectTool(tool)"
              @keydown.enter.prevent.stop="selectTool(tool)"
              @keydown.space.prevent.stop="selectTool(tool)"
            >
              <div class="tool-icon-wrapper">
                <span class="tool-icon">🛠️</span>
              </div>
              <div class="tool-info">
                <div class="tool-name">{{ tool.name }}</div>
                <div class="tool-summary" v-if="tool.description">{{ tool.description }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="work-area" ref="workAreaEl" :style="{ '--drawerHeight': (bottomCollapsed ? 44 : drawerHeight) + 'px' }">
        <div
          class="runner"
          ref="runnerEl"
          :class="{ 'result-collapsed': resultCollapsed, 'params-collapsed': paramsCollapsed }"
          :style="{ '--resultHeight': (resultCollapsed ? 44 : resultHeight) + 'px' }"
        >
          <template v-if="selectedTool">
            <div class="runner-header" ref="runnerHeaderEl">
              <div class="runner-title">
                <div class="tool-title">{{ selectedTool.name }}</div>
                <div class="tool-desc" v-if="selectedTool.description">{{ selectedTool.description }}</div>
              </div>
              <div class="runner-actions">
                <button class="btn btn-light" type="button" @click="paramsCollapsed = !paramsCollapsed">
                  {{ paramsCollapsed ? '展开参数' : '收起参数' }}
                </button>
                <button class="btn btn-light" type="button" @click="copyInput">复制输入</button>
                <button class="btn btn-light" type="button" @click="clearInput">清空参数</button>
                <button class="btn btn-primary" type="button" @click="executeTool" :disabled="calling || connectionStatus !== 'connected'">
                  {{ calling ? '运行中...' : '运行工具' }}
                </button>
              </div>
            </div>

            <div v-if="!paramsCollapsed" class="runner-body custom-scrollbar">
              <div class="section-title">参数</div>
              <div class="schema-hint">{{ schemaHint }}</div>
              <SchemaForm :schema="selectedTool.inputSchema" v-model="toolArguments" />
            </div>

            <div v-if="!paramsCollapsed && !resultCollapsed" class="runner-inner-splitter" @pointerdown="startResultResize">
              <div class="runner-inner-grip"></div>
            </div>

            <div class="runner-result">
              <div class="result-header">
                <div class="result-left">
                  <span class="section-title">结果</span>
                  <span v-if="callResult" class="pill" :class="callResult.success && !callResult.is_error ? 'success' : 'error'">
                    {{ callResult.success && !callResult.is_error ? '成功' : '失败' }}
                  </span>
                  <span v-if="callResult?.duration_ms" class="pill time">{{ callResult.duration_ms }}ms</span>
                </div>
                <div class="result-right">
                  <button class="btn btn-light btn-sm" type="button" @click="resultView = 'structured'" :class="{ active: resultView === 'structured' }">结构化</button>
                  <button class="btn btn-light btn-sm" type="button" @click="resultView = 'raw'" :class="{ active: resultView === 'raw' }">原始JSON</button>
                  <button class="btn btn-light btn-sm" type="button" @click="copyResult" :disabled="!callResult">复制结果</button>
                  <button class="btn btn-light btn-sm" type="button" @click="clearResult" :disabled="!callResult">清空</button>
                  <button class="btn btn-light btn-sm" type="button" @click="resultCollapsed = !resultCollapsed">
                    {{ resultCollapsed ? '展开' : '收起' }}
                  </button>
                  <button class="btn btn-light btn-sm" type="button" @click="toggleFocus">
                    {{ focusMode ? '退出最大化' : '结果最大化' }}
                  </button>
                </div>
              </div>
              <div v-if="!resultCollapsed" class="result-body custom-scrollbar">
                <div v-if="!callResult && !calling" class="placeholder">运行工具后将在此处显示返回结果</div>
                <div v-else-if="calling" class="calling-overlay">
                  <div class="calling-content">
                    <div class="calling-spinner-large"></div>
                    <div class="calling-info">
                      <div class="calling-title">正在调用 {{ selectedTool?.name }}</div>
                      <div class="calling-timer">
                        已等待 <span class="time-value">{{ elapsedSeconds }}</span>s / {{ timeoutSeconds }}s
                      </div>
                      <div class="calling-progress">
                        <div class="progress-bar">
                          <div 
                            class="progress-fill" 
                            :style="{ width: progressPercent + '%' }"
                            :class="{ 'progress-warning': progressPercent > 70, 'progress-danger': progressPercent > 90 }"
                          ></div>
                        </div>
                      </div>
                      <button class="btn btn-light btn-sm btn-cancel" @click="cancelCall">
                        取消调用
                      </button>
                    </div>
                  </div>
                </div>
                <template v-else-if="callResult">
                  <!-- 结构化视图 -->
                  <template v-if="resultView === 'structured'">
                    <!-- 成功且无错误 -->
                    <template v-if="callResult.success && !callResult.is_error">
                      <ContentRenderer :content="callResult.content" />
                    </template>
                    <!-- 工具返回错误 -->
                    <div v-else class="error-result">
                      <div class="error-header">
                        <span class="error-icon">⚠️</span>
                        <span class="error-title">{{ callResult.success ? '工具执行错误' : '调用失败' }}</span>
                      </div>
                      <div class="error-message">{{ callResult.error || '未知错误' }}</div>
                      <ContentRenderer v-if="callResult.content" :content="callResult.content" />
                    </div>
                  </template>
                  <!-- 原始JSON视图 -->
                  <pre v-else class="code">{{ formatJson(callResult) }}</pre>
                </template>
              </div>
            </div>
          </template>

          <div v-else class="runner-empty">
            <div class="empty-title">右侧将展示工具参数</div>
            <div class="empty-sub">状态：{{ statusText }} · 工具数：{{ tools.length }}</div>
            <div class="empty-sub">请先连接服务，然后从左侧工具列表选择一个工具</div>
          </div>
        </div>

        <div class="work-splitter" @pointerdown="startResize">
          <div class="work-splitter-grip"></div>
        </div>

        <div class="bottom-drawer" :class="{ collapsed: bottomCollapsed }">
          <div class="drawer-header">
            <div class="tabs">
              <button type="button" class="tab" :class="{ active: bottomTab === 'history' }" @click="bottomTab = 'history'">历史</button>
              <button type="button" class="tab" :class="{ active: bottomTab === 'events' }" @click="bottomTab = 'events'">通知</button>
            </div>
            <div class="drawer-actions">
              <button v-if="bottomTab === 'history'" type="button" class="btn btn-light btn-sm" @click="clearHistory" :disabled="history.length === 0">清空</button>
              <button v-else type="button" class="btn btn-light btn-sm" @click="clearEvents" :disabled="events.length === 0">清空</button>
              <button type="button" class="btn btn-light btn-sm" @click="bottomCollapsed = !bottomCollapsed">
                {{ bottomCollapsed ? '展开' : '收起' }}
              </button>
            </div>
          </div>
          <div v-if="!bottomCollapsed" class="drawer-body">
            <McpHistoryPanel v-if="bottomTab === 'history'" :entries="history" @select="applyHistory" />
            <McpNotificationsPanel v-else :entries="events" />
          </div>
        </div>
      </div>
    </div>

    <div class="panel-footer" v-if="connectionStatus === 'connected'">
      <div class="footer-left">
        <div class="server-info-pill" v-if="connectResult?.server_info">
          <span class="status-indicator online"></span>
          <span class="server-name">{{ connectResult.server_info.name }}</span>
          <span class="server-version">v{{ connectResult.server_info.version }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <button class="btn btn-text" @click="$emit('close')">关闭</button>
        <div class="action-group">
          <button class="btn btn-danger-soft" @click="confirmTest(-1)">❌ 测试失败</button>
          <button class="btn btn-success-soft" @click="confirmTest(1)">✅ 测试通过</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import SchemaForm from './SchemaForm.vue';
import ContentRenderer from './ContentRenderer.vue';
import McpHistoryPanel, { type HistoryEntry } from './McpHistoryPanel.vue';
import McpNotificationsPanel, { type NotifyEntry, type NotifyLevel } from './McpNotificationsPanel.vue';
import { testConnect, testCall, testConfirm } from '../api/mcpTest';
import type { McpTool, ConnectResponse, CallResponse } from '../types/mcp';

const props = defineProps<{
  configId: number;
  serviceName: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirmed', status: number): void;
}>();

// 状态
const connecting = ref(false);
const calling = ref(false);
const connectionError = ref<string | null>(null);
const connectResult = ref<ConnectResponse | null>(null);
const tools = ref<McpTool[]>([]);
const selectedTool = ref<McpTool | null>(null);
const toolArguments = ref<Record<string, any>>({});
const callResult = ref<CallResponse | null>(null);
const resultView = ref<'structured' | 'raw'>('structured');
const resultCollapsed = ref(false);
const paramsCollapsed = ref(false);
const focusMode = ref(false);
const toolQuery = ref('');

const bottomTab = ref<'history' | 'events'>('history');
const bottomCollapsed = ref(true);
const drawerHeight = ref(280);
const workAreaEl = ref<HTMLDivElement | null>(null);
const runnerEl = ref<HTMLDivElement | null>(null);
const runnerHeaderEl = ref<HTMLDivElement | null>(null);
// 默认结果区域高度，设置较小值确保参数区域有足够空间
const resultHeight = ref(200);

const history = ref<HistoryEntry[]>([]);
const events = ref<NotifyEntry[]>([]);
const historySeq = ref(0);

// 历史记录持久化相关常量
const HISTORY_STORAGE_KEY = `mcp-history-${props.configId}`;
const HISTORY_MAX_ITEMS = 50; // 最大保存条数

// 超时进度相关状态
const timeoutSeconds = ref(30); // 默认超时时间（秒）
const elapsedSeconds = ref(0);
const callStartTime = ref<number | null>(null);
const progressTimer = ref<ReturnType<typeof setInterval> | null>(null);
const resizing = ref(false);
const resizeStartY = ref(0);
const resizeStartHeight = ref(0);
const activePointerId = ref<number | null>(null);
const resizingResult = ref(false);
const resultStartY = ref(0);
const resultStartHeight = ref(0);
const activeResultPointerId = ref<number | null>(null);

try {
  const stored = Number(localStorage.getItem('mcpTestPanel.drawerHeight'));
  if (Number.isFinite(stored) && stored >= 120 && stored <= 520) {
    drawerHeight.value = stored;
  }
} catch {
  // ignore
}

try {
  const stored = Number(localStorage.getItem('mcpTestPanel.resultHeight'));
  if (Number.isFinite(stored) && stored >= 140 && stored <= 800) {
    resultHeight.value = stored;
  }
} catch {
  // ignore
}

// 加载持久化的历史记录
const loadPersistedHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        history.value = parsed;
        // 恢复 historySeq
        if (parsed.length > 0) {
          historySeq.value = Math.max(...parsed.map((h: HistoryEntry) => h.seq || 0));
        }
      }
    }
  } catch (e) {
    console.warn('加载历史记录失败:', e);
  }
};

// 保存历史记录到 localStorage
const saveHistoryToStorage = () => {
  try {
    // 只保存最近的 HISTORY_MAX_ITEMS 条记录
    const toSave = history.value.slice(0, HISTORY_MAX_ITEMS);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('保存历史记录失败:', e);
  }
};

// 初始化时加载历史记录
loadPersistedHistory();

// 监听历史记录变化，自动保存
watch(history, () => {
  saveHistoryToStorage();
}, { deep: true });

// 计算属性
const connectionStatus = computed(() => {
  if (connecting.value) return 'connecting';
  if (connectResult.value?.success) return 'connected';
  if (connectionError.value) return 'error';
  return 'disconnected';
});

const statusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting': return '连接中...';
    case 'connected': return '在线';
    case 'error': return '离线';
    default: return '未连接';
  }
});

const filteredTools = computed(() => {
  const q = toolQuery.value.trim().toLowerCase();
  if (!q) return tools.value;
  return tools.value.filter(t => {
    const n = (t.name || '').toLowerCase();
    const d = (t.description || '').toLowerCase();
    return n.includes(q) || d.includes(q);
  });
});

const schemaHint = computed(() => {
  const schema = selectedTool.value?.inputSchema as any;
  if (!schema) return 'Schema：无';
  const props = schema?.properties;
  const count = props && typeof props === 'object' ? Object.keys(props).length : 0;
  if (!props) return 'Schema：无参数';
  return `Schema：${count} 个字段`;
});

watch(
  () => [tools.value.length, connectResult.value?.success] as const,
  () => {
    if (!selectedTool.value && tools.value.length > 0) {
      selectTool(tools.value[0]);
    }
  },
  { immediate: true }
);

const clampDrawerHeight = (value: number) => {
  const minDrawer = 160;
  const minRunner = 260;
  const splitter = 12;
  const container = workAreaEl.value?.clientHeight ?? window.innerHeight;
  const maxDrawer = Math.max(minDrawer, container - splitter - minRunner);
  return Math.max(minDrawer, Math.min(maxDrawer, value));
};

const onPointerMove = (e: PointerEvent) => {
  if (!resizing.value) return;
  if (activePointerId.value !== null && e.pointerId !== activePointerId.value) return;
  const dy = resizeStartY.value - e.clientY;
  const next = resizeStartHeight.value + dy;
  drawerHeight.value = clampDrawerHeight(next);
};

const stopResize = () => {
  if (!resizing.value) return;
  resizing.value = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  activePointerId.value = null;
  try {
    localStorage.setItem('mcpTestPanel.drawerHeight', String(drawerHeight.value));
  } catch {
    // ignore
  }
};

const startResize = (e: PointerEvent) => {
  e.preventDefault();
  if (bottomCollapsed.value) bottomCollapsed.value = false;
  resizing.value = true;
  resizeStartY.value = e.clientY;
  resizeStartHeight.value = drawerHeight.value;
  activePointerId.value = e.pointerId;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
};

const clampResultHeight = (value: number) => {
  const minResult = 120;  // 结果区域最小高度
  const minParams = 120;  // 参数区域最小高度
  const splitter = 12;
  const header = runnerHeaderEl.value?.clientHeight ?? 60;
  const container = runnerEl.value?.clientHeight ?? 500;
  // 最大结果高度 = 容器高度 - header - splitter - 参数最小高度
  const maxResult = Math.max(minResult, container - header - splitter - minParams);
  return Math.max(minResult, Math.min(maxResult, value));
};

const onResultPointerMove = (e: PointerEvent) => {
  if (!resizingResult.value) return;
  if (activeResultPointerId.value !== null && e.pointerId !== activeResultPointerId.value) return;
  // 向上拖动 (clientY 变小) 时，结果区域变大
  const dy = resultStartY.value - e.clientY;
  const next = resultStartHeight.value + dy;
  resultHeight.value = clampResultHeight(next);
};

const stopResultResize = () => {
  if (!resizingResult.value) return;
  resizingResult.value = false;
  window.removeEventListener('pointermove', onResultPointerMove);
  window.removeEventListener('pointerup', stopResultResize);
  window.removeEventListener('pointercancel', stopResultResize);
  activeResultPointerId.value = null;
  try {
    localStorage.setItem('mcpTestPanel.resultHeight', String(resultHeight.value));
  } catch {
    // ignore
  }
};

const startResultResize = (e: PointerEvent) => {
  e.preventDefault();
  if (resultCollapsed.value) resultCollapsed.value = false;
  if (paramsCollapsed.value) paramsCollapsed.value = false;
  resizingResult.value = true;
  resultStartY.value = e.clientY;
  resultStartHeight.value = resultHeight.value;
  activeResultPointerId.value = e.pointerId;
  window.addEventListener('pointermove', onResultPointerMove);
  window.addEventListener('pointerup', stopResultResize);
  window.addEventListener('pointercancel', stopResultResize);
};

onBeforeUnmount(() => {
  stopResize();
  stopResultResize();
  stopProgressTimer();
});

const addEvent = (level: NotifyLevel, message: string, payload?: any) => {
  const ts = Date.now();
  events.value.unshift({
    id: `${ts}-${Math.random().toString(16).slice(2)}`,
    ts,
    level,
    message,
    payload
  });
};

const addHistory = (method: string, request: any, response: any, status: 'success' | 'error', duration_ms?: number, title?: string) => {
  const ts = Date.now();
  historySeq.value += 1;
  history.value.unshift({
    id: `${ts}-${Math.random().toString(16).slice(2)}`,
    seq: historySeq.value,
    ts,
    method,
    title,
    status,
    duration_ms,
    request,
    response
  });
};

// 连接服务
const connect = async () => {
  connecting.value = true;
  connectionError.value = null;
  
  try {
    const response = await testConnect(props.configId);
    
    if (response.code === 0 && response.data.success) {
      connectResult.value = response.data;
      tools.value = response.data.tools || [];
      // 自动选择第一个工具
      if (tools.value.length > 0) {
        selectTool(tools.value[0]);
      }
      addEvent('info', '连接成功', { server_info: response.data.server_info, tools_count: tools.value.length });
      addHistory('initialize', { method: 'initialize', params: {} }, { server_info: response.data.server_info, wemcp_name: response.data.wemcp_name }, 'success', response.data.duration_ms);
      addHistory('tools/list', { method: 'tools/list', params: {} }, { tools: tools.value }, 'success');
    } else {
      connectionError.value = response.data.error || response.message || '连接失败';
      addEvent('error', '连接失败', { error: connectionError.value });
      addHistory('initialize', { method: 'initialize', params: {} }, { error: connectionError.value }, 'error');
    }
  } catch (err: any) {
    connectionError.value = err.message || '网络错误';
    addEvent('error', '网络错误', { error: connectionError.value });
    addHistory('initialize', { method: 'initialize', params: {} }, { error: connectionError.value }, 'error');
  } finally {
    connecting.value = false;
  }
};

const disconnect = () => {
  connectResult.value = null;
  tools.value = [];
  selectedTool.value = null;
  toolArguments.value = {};
  callResult.value = null;
  connectionError.value = null;
  addEvent('info', '已断开连接');
};

// 选择工具
const selectTool = (tool: McpTool) => {
  selectedTool.value = tool;
  toolArguments.value = {};
  callResult.value = null;
  resultView.value = 'structured';
  resultCollapsed.value = false;
  paramsCollapsed.value = false;
  addEvent('info', `选择工具：${tool.name}`);
};

// 启动进度计时器
const startProgressTimer = () => {
  callStartTime.value = Date.now();
  elapsedSeconds.value = 0;
  progressTimer.value = setInterval(() => {
    if (callStartTime.value) {
      elapsedSeconds.value = Math.floor((Date.now() - callStartTime.value) / 1000);
    }
  }, 100);
};

// 停止进度计时器
const stopProgressTimer = () => {
  if (progressTimer.value) {
    clearInterval(progressTimer.value);
    progressTimer.value = null;
  }
  callStartTime.value = null;
};

// 计算进度百分比
const progressPercent = computed(() => {
  if (!calling.value || timeoutSeconds.value <= 0) return 0;
  return Math.min(100, (elapsedSeconds.value / timeoutSeconds.value) * 100);
});

// 取消调用（目前仅关闭进度指示，实际请求无法取消）
const cancelCall = () => {
  stopProgressTimer();
  calling.value = false;
  callResult.value = {
    success: false,
    error: '用户取消了调用'
  };
  if (selectedTool.value) {
    addEvent('warn', `用户取消调用：${selectedTool.value.name}`);
  }
};

// 执行工具
const executeTool = async () => {
  if (!selectedTool.value) return;
  
  calling.value = true;
  callResult.value = null;
  startProgressTimer();
  
  try {
    const response = await testCall(
      props.configId,
      selectedTool.value.name,
      toolArguments.value
    );
    
    callResult.value = response.data;
    addEvent(
      callResult.value.success && !callResult.value.is_error ? 'info' : 'warn',
      `调用工具：${selectedTool.value.name}`,
      { success: callResult.value.success, is_error: callResult.value.is_error, duration_ms: callResult.value.duration_ms }
    );
    addHistory(
      'tools/call',
      { method: 'tools/call', params: { name: selectedTool.value.name, arguments: toolArguments.value } },
      callResult.value,
      callResult.value.success && !callResult.value.is_error ? 'success' : 'error',
      callResult.value.duration_ms,
      selectedTool.value.name
    );
  } catch (err: any) {
    callResult.value = {
      success: false,
      error: err.message || '调用失败'
    };
    addEvent('error', `调用失败：${selectedTool.value.name}`, { error: callResult.value.error });
    addHistory(
      'tools/call',
      { method: 'tools/call', params: { name: selectedTool.value.name, arguments: toolArguments.value } },
      callResult.value,
      'error',
      undefined,
      selectedTool.value.name
    );
  } finally {
    stopProgressTimer();
    calling.value = false;
  }
};

const toggleFocus = () => {
  focusMode.value = !focusMode.value;
  if (focusMode.value) {
    bottomCollapsed.value = true;
    resultCollapsed.value = false;
    paramsCollapsed.value = true;
    resultHeight.value = clampResultHeight(9999);
  } else {
    paramsCollapsed.value = false;
  }
};

const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const copyResult = async () => {
  if (!callResult.value) return;
  try {
    await navigator.clipboard.writeText(formatJson(callResult.value));
  } catch {
    // ignore
  }
};

const clearResult = () => {
  callResult.value = null;
};

const copyInput = async () => {
  try {
    await navigator.clipboard.writeText(formatJson(toolArguments.value));
  } catch {
    // ignore
  }
};

const clearInput = () => {
  toolArguments.value = {};
};

const clearHistory = () => {
  history.value = [];
  historySeq.value = 0;
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const clearEvents = () => {
  events.value = [];
};

const applyHistory = (entry: HistoryEntry) => {
  if (entry.method !== 'tools/call') return;
  const name = entry.request?.params?.name;
  const args = entry.request?.params?.arguments;
  const tool = tools.value.find(t => t.name === name) || null;
  if (tool) selectedTool.value = tool;
  toolArguments.value = args && typeof args === 'object' ? args : {};
  callResult.value = entry.response as CallResponse;
  bottomCollapsed.value = true;
};

// 确认测试结果
const confirmTest = async (status: number) => {
  try {
    const response = await testConfirm(props.configId, status);
    
    if (response.code === 0) {
      emit('confirmed', status);
      emit('close');
    } else {
      alert('更新状态失败: ' + response.message);
    }
  } catch (err: any) {
    alert('操作失败: ' + err.message);
  }
};
</script>

<style scoped>
.mcp-test-panel {
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --primary-light: #eff6ff;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --bg-dark: #1e293b;
  --text-main: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.02);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-main);
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

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.header-info h2 {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #f1f5f9;
  color: var(--text-secondary);
}

.connection-badge.connected { background: #dcfce7; color: #15803d; }
.connection-badge.connecting { background: #fef3c7; color: #b45309; }
.connection-badge.error { background: #fee2e2; color: #b91c1c; }

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

.btn-close {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #64748b;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  background: #f8fafc;
}

.mcp-test-panel.focus-mode .sidebar {
  display: none;
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  /* 确保 sidebar 完整填满父容器高度 */
  height: 100%;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  /* 连接卡片不收缩 */
  flex-shrink: 0;
}

.tools-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 工具卡片占据剩余空间并允许内部滚动 */
  overflow: hidden;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.card-title {
  font-weight: 800;
  color: #0f172a;
}

.count {
  font-size: 0.8rem;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.kv {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.k {
  color: #94a3b8;
}

.v {
  color: #334155;
  word-break: break-all;
}

.err {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.9rem;
  line-height: 1.4;
}

.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.search {
  margin-bottom: 10px;
}

.search-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.tools-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 10px;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tool-item:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.tool-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tool-item.active {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.tool-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-item.active .tool-icon-wrapper {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.tool-name {
  font-weight: 800;
  color: #0f172a;
  font-size: 0.95rem;
  line-height: 1.3;
  word-break: break-all;
}

.tool-summary {
  margin-top: 2px;
  color: #64748b;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-area {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-rows: 1fr 12px var(--drawerHeight);
  padding: 12px;
  gap: 0;
  overflow: hidden;
  background: #f8fafc;
}

.runner {
  min-height: 0;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  overflow: hidden;
  display: grid;
  /* 使用 minmax 确保参数区域至少有 120px，结果区域至少有 120px */
  grid-template-rows: auto minmax(120px, 1fr) 12px minmax(120px, var(--resultHeight));
}

.runner.result-collapsed {
  grid-template-rows: auto 1fr 0px 44px;
}

.runner.params-collapsed {
  grid-template-rows: auto 0px 0px 1fr;
}

.runner-header {
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.runner-title {
  min-width: 0;
}

.tool-title {
  font-weight: 900;
  color: #0f172a;
  font-size: 1.1rem;
}

.tool-desc {
  margin-top: 4px;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.5;
  max-width: 900px;
}

.runner-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.runner-body {
  padding: 14px 16px 18px;
  overflow: auto;
  min-height: 0;
}

.schema-hint {
  margin: -4px 0 12px;
  color: #94a3b8;
  font-size: 0.82rem;
}

.runner-inner-splitter {
  height: 12px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
}

.runner-inner-splitter:hover {
  background: rgba(59, 130, 246, 0.06);
}

.runner-inner-grip {
  width: 56px;
  height: 4px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 -6px 0 #cbd5e1, 0 6px 0 #cbd5e1;
  opacity: 0.85;
}

.runner-inner-splitter:hover .runner-inner-grip {
  background: #93c5fd;
  box-shadow: 0 -6px 0 #93c5fd, 0 6px 0 #93c5fd;
}

.section-title {
  font-weight: 800;
  color: #334155;
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.runner-result {
  border-top: 1px solid #e2e8f0;
  background: #0b1220;
  color: #e2e8f0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #0f172a;
  border-bottom: 1px solid #1f2a44;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-right {
  display: flex;
  gap: 8px;
}

.result-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.placeholder {
  color: rgba(226, 232, 240, 0.55);
  font-size: 0.9rem;
  padding: 10px 0;
}

.calling-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
}

.calling-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(226, 232, 240, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 错误结果样式 */
.error-result {
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  font-size: 1.2rem;
}

.error-title {
  font-weight: 700;
  color: #fca5a5;
  font-size: 0.95rem;
}

.error-message {
  color: #fecaca;
  font-size: 0.9rem;
  line-height: 1.5;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 调用进度指示器样式 */
.calling-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.calling-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.calling-spinner-large {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.calling-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.calling-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
}

.calling-timer {
  font-size: 0.9rem;
  color: #94a3b8;
}

.time-value {
  font-weight: 700;
  color: #3b82f6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.calling-progress {
  width: 200px;
}

.progress-bar {
  height: 6px;
  background: rgba(100, 116, 139, 0.3);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  transition: width 0.1s linear, background 0.3s ease;
}

.progress-fill.progress-warning {
  background: #f59e0b;
}

.progress-fill.progress-danger {
  background: #ef4444;
  animation: pulse-danger 0.5s ease-in-out infinite alternate;
}

@keyframes pulse-danger {
  from { opacity: 0.8; }
  to { opacity: 1; }
}

.btn-cancel {
  margin-top: 8px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.85rem;
  line-height: 1.55;
}

.runner-empty {
  min-height: 0;
  border-radius: 16px;
  border: 1px dashed #cbd5e1;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.empty-title {
  font-weight: 900;
  color: #0f172a;
  font-size: 1.1rem;
  margin-bottom: 6px;
}

.empty-sub {
  font-size: 0.9rem;
}

.work-splitter {
  height: 12px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  background: transparent;
}

.work-splitter:hover {
  background: rgba(59, 130, 246, 0.06);
}

.work-splitter-grip {
  width: 56px;
  height: 4px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 -6px 0 #cbd5e1, 0 6px 0 #cbd5e1;
  opacity: 0.85;
}

.work-splitter:hover .work-splitter-grip {
  background: #93c5fd;
  box-shadow: 0 -6px 0 #93c5fd, 0 6px 0 #93c5fd;
}

.bottom-drawer {
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.bottom-drawer.collapsed {
  height: 44px;
}

.drawer-header {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #f8fafc;
}

.tabs {
  display: flex;
  gap: 6px;
}

.tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
  color: #334155;
}

.tab.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.drawer-actions {
  display: flex;
  gap: 8px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  border: 1px solid #e2e8f0;
  background: #f1f5f9;
  color: #334155;
}

.pill.connected {
  background: #dcfce7;
  border-color: #bbf7d0;
  color: #15803d;
}

.pill.connecting {
  background: #fef3c7;
  border-color: #fde68a;
  color: #b45309;
}

.pill.error {
  background: #fee2e2;
  border-color: #fecaca;
  color: #b91c1c;
}

.pill.success {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.25);
  color: #34d399;
}

.pill.time {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
}

/* 按钮 */
.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  user-select: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-light {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.btn-light:hover:not(:disabled) {
  background: #e2e8f0;
}

.btn-sm {
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 800;
}

.btn-sm.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.btn-text {
  background: transparent;
  color: #64748b;
  border: 1px solid transparent;
}
.btn-text:hover {
  background: #f1f5f9;
  color: #334155;
}

.btn-success-soft {
  background: #ecfdf5;
  color: #059669;
}
.btn-success-soft:hover { background: #d1fae5; }

.btn-danger-soft {
  background: #fef2f2;
  color: #dc2626;
}
.btn-danger-soft:hover { background: #fee2e2; }

/* 底部操作区 */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0;
}

.server-info-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator.online { background: #10b981; }

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 10px;
}

.tool-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.tool-title-row h3 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}

.tag {
  padding: 4px 8px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.tool-description {
  font-size: 0.95rem;
  color: #475569;
  line-height: 1.6;
  margin: 0;
  max-width: 800px;
}

/* 2. 参数配置 (1fr) */
.workbench-top {
  overflow-y: auto; /* 独立滚动 */
  background: #fff;
  padding: 0 24px 20px;
  min-height: 0;
}

.tool-config {
  height: 100%;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
}

.section-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.section-line {
  flex: 1;
  height: 1px;
  background: #f1f5f9;
}

.params-container {
  max-width: 1000px;
  padding-bottom: 20px;
}

/* 3. 操作栏 (auto) */
.action-bar-divider {
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

/* 4. 终端区域 (250px) */
.workbench-bottom {
  /* 高度由 grid-template-rows 控制 */
  display: flex;
  flex-direction: column;
  background: #1e293b;
  color: #e2e8f0;
  border-top: 1px solid #334155;
  overflow: hidden;
}

/* 终端样式 */
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}

.terminal-controls {
  display: flex;
  gap: 8px;
}

.terminal-title {
  font-family: 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
}

.result-line {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  opacity: 0.7;
  font-size: 0.8rem;
}

.result-line .prompt { color: #10b981; font-weight: bold; }
.result-line .cmd { color: #e2e8f0; }
.result-line .time { color: #64748b; margin-left: auto; }

.code-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: #e2e8f0;
  line-height: 1.6;
}

.result-content.error .code-block {
  color: #fca5a5;
}

.terminal-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #475569;
  opacity: 0.5;
}

.placeholder-visual {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* 底部操作区 */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0;
  z-index: 20;
}

.server-info-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator.online { background: #10b981; }

.footer-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 12px;
}

/* 按钮组件 */
.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 8px 12px -1px rgba(37, 99, 235, 0.3);
  transform: translateY(-1px);
}

.btn-glow:not(:disabled) {
  position: relative;
  overflow: hidden;
}

.btn-glow:after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
  transform: skewX(-20deg) translateX(-150%);
  transition: transform 0.5s;
}

.btn-glow:hover:after {
  transform: skewX(-20deg) translateX(150%);
  transition: transform 0.5s;
}

.btn-text {
  background: transparent;
  color: #64748b;
}
.btn-text:hover { color: #334155; background: #f1f5f9; }

.btn-success-soft {
  background: #ecfdf5;
  color: #059669;
}
.btn-success-soft:hover { background: #d1fae5; }

.btn-danger-soft {
  background: #fef2f2;
  color: #dc2626;
}
.btn-danger-soft:hover { background: #fee2e2; }

.btn-block { width: 100%; padding: 12px; font-size: 1rem; }
.btn-lg { padding: 12px 32px; font-size: 1rem; }

.btn-icon-sm {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  color: #cbd5e1;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.btn-icon-sm:hover { background: rgba(255,255,255,0.2); color: #fff; }

/* 动画 */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-large {
  width: 48px; height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* 空状态 */
.empty-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.empty-content {
  text-align: center;
  max-width: 300px;
}

.empty-illustration {
  font-size: 4rem;
  margin-bottom: 24px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-10px); }
}

.empty-content h3 {
  color: #334155;
  font-size: 1.25rem;
  margin-bottom: 8px;
}
.empty-content p { color: #64748b; }
</style>
